import AddGameDialog from './AddGameDialog';
import { Priority, IGameSpec, IGame } from './types';

import * as fsx from 'fs-extra';
import * as path from 'path';
import * as template from 'string-template';
import * as vortexApi from 'vortex-api';
import { types } from 'vortex-api';

const { actions, fs, util } = vortexApi;

const GAME_STORES = ['steam', 'epic', 'origin', 'uplay', 'gog', 'xbox'];
const WIKI_URL =
  'https://wiki.nexusmods.com/index.php/Packaging_extensions_for_Vortex';

function modTypePriority(priority: Priority): number {
  return {
    high: 25,
    low: 75,
  }[priority];
}

function makeFindGame(api: types.IExtensionApi, gameSpec: IGameSpec) {
  return () =>
    util.GameStoreHelper.findByAppId(gameSpec.discovery.ids)
      .catch(() => util.GameStoreHelper.findByName(gameSpec.discovery.names))
      .then((game: types.IGameStoreEntry) => game.gamePath);
}

function makeGetModPath(api: types.IExtensionApi, gameSpec: IGameSpec) {
  return () =>
    gameSpec.game.modPathIsRelative !== false
      ? gameSpec.game.modPath || '.'
      : pathPattern(api, gameSpec.game, gameSpec.game.modPath);
}

function requiresLauncher(gamePath: string) {
  return Promise.resolve(undefined);
}

function pathPattern(
  api: types.IExtensionApi,
  game: IGame | types.IGame,
  pattern: string,
): string {
  return template(pattern, {
    gamePath: api.getState().settings.gameMode.discovered[game.id]?.path,
    documents: util.getVortexPath('documents'),
  });
}

const tools = [];

function applyGame(context: types.IExtensionContext, gameSpec: IGameSpec) {
  const game: types.IGame = {
    ...gameSpec.game,
    queryPath: makeFindGame(context.api, gameSpec),
    queryModPath: makeGetModPath(context.api, gameSpec),
    requiresLauncher,
    requiresCleanup: true,
    executable: () => gameSpec.game.executable,
    supportedTools: tools,
  };

  context.registerGame(game);
  (gameSpec.modTypes || []).forEach((type, idx) => {
    context.registerModType(
      type.id,
      modTypePriority(type.priority) + idx,
      (gameId) => gameId === gameSpec.game.id,
      (game) => pathPattern(context.api, game, type.targetPath),
      () => Promise.resolve(false),
      { name: type.name },
    );
  });
}

function makeInfo(game: IGame, userName: string) {
  return {
    name: `Game: ${game.name}`,
    author: userName,
    version: '1.0.0',
    description: `Vortex support for ${game.name}`,
  };
}

async function exportGame(
  api: types.IExtensionApi,
  spec: IGameSpec,
  imageUrl: string,
) {
  try {
    const state = api.getState();

    spec.game.logo = path.basename(spec.game.logo);

    const baseExtCode = await fs.readFileAsync(
      path.join(__dirname, 'ext_template.js'),
      { encoding: 'utf8' },
    );
    const extCode = template(baseExtCode, {
      spec: JSON.stringify(spec, undefined, 2),
      modTypePriorityFunc: modTypePriority.toString(),
      pathPatternFunc: pathPattern.toString(),
      queryPathFunc: makeFindGame.toString(),
      queryModPathFunc: makeGetModPath.toString(),
      requiresLanucherFunc: requiresLauncher.toString(),
      applyFunc: applyGame.toString(),
    });
    const exportPath = path.resolve(__dirname, '..', `game-${spec.game.id}`);
    await fs.ensureDirAsync(exportPath);
    await fs.writeFileAsync(path.join(exportPath, 'index.js'), extCode, {
      encoding: 'utf8',
    });
    const userName =
      state.persistent['nexus']?.userInfo?.name || process.env.USERNAME;
    await fs.writeFileAsync(
      path.join(exportPath, 'info.json'),
      JSON.stringify(makeInfo(spec.game, userName), undefined, 2),
      { encoding: 'utf8' },
    );

    if (imageUrl !== undefined) {
      const imageData = await util.rawRequest(imageUrl);
      await fs.writeFileAsync(path.join(exportPath, spec.game.logo), imageData);
    }

    api.sendNotification({
      type: 'success',
      message: exportPath,
      title: 'Export successful.',
      actions: [
        {
          title: 'Further steps',
          action: () => {
            api.showDialog(
              'info',
              'Further steps',
              {
                bbcode:
                  'The game extension was created in [url="file://{{extensionPathUrl}}"]{{extensionPath}}[/url]<br/>' +
                  'You may want to review the information in info.json file and also index.js ' +
                  'contains a lot of comments explaining how to add functionality not available ' +
                  'in this wizard.<br/><br/>' +
                  'When you want to publish this extension, ' +
                  'all you have to do is create a zip or 7z file containing the files in the directory above and upload ' +
                  'that to www.nexusmods.com/site.<br/>' +
                  'Please also see [url]{{wikiurl}}[/url] on how to package extensions correctly.<br/>',
                parameters: {
                  extensionPath: exportPath,
                  extensionPathUrl: exportPath.replace(path.sep, '/'),
                  wikiurl: WIKI_URL,
                },
              },
              [{ label: 'Close' }],
            );
          },
        },
      ],
    });
  } catch (err) {
    api.showErrorNotification('Failed to export game', err);
  }
}

const extState = util.makeReactive({
  nexusGames: [],
  storeGames: {},
});

function init(context: types.IExtensionContext): boolean {
  context.registerDialog('add-game-dialog', AddGameDialog, () => ({
    nexusGames: extState.nexusGames,
    storeGames: extState.storeGames,
    onSave: (game: IGameSpec, imageUrl: string) =>
      exportGame(context.api, game, imageUrl),
  }));

  context.registerAction('game-icons', 200, 'add', {}, 'Add Game', () => {
    context.api.store.dispatch(actions.setDialogVisible('add-game-dialog'));
  });

  context.once(() => {
    context.api.setStylesheet(
      'add-game',
      path.join(__dirname, 'add-game.scss'),
    );

    // fetch info for all nexus games
    (context.api as any).ext
      .getNexusGames()
      .then((games) => (extState.nexusGames = games));

    // fetch info for store games
    Promise.all(
      GAME_STORES.map((storeId) => {
        const store = util.GameStoreHelper.getGameStore(storeId);
        if (store === undefined) {
          return null;
        }
        return store
          .allGames()
          .then((games) => ({
            storeId,
            games: util.unique<types.IGameStoreEntry, any>(
              games,
              (item) => item.appid,
            ),
          }));
      }),
    ).then((results) => {
      results.forEach((res) => {
        if (res !== null) {
          extState.storeGames[res.storeId] = res.games;
        }
      });
    });
  });

  return true;
}

export default init;
