import * as path from 'path';
import * as React from 'react';
import {
  Form,
  FormControl,
  FormGroup,
  ControlLabel,
  Col,
  HelpBlock,
  Button,
  InputGroup,
  ListGroup,
  ListGroupItem,
} from 'react-bootstrap';
import { withTranslation, WithTranslation } from 'react-i18next';
import Select from 'react-select';
import { generate as shortid } from 'shortid';
import {
  ComponentEx,
  FormInput,
  Modal,
  types,
  Icon,
  Steps,
  Spinner,
  Toggle,
  tooltip,
  Usage,
  FlexLayout,
  log,
} from 'vortex-api';
import { IGameSpec, IModTypeSpec } from './types';
import { TFunction } from 'i18next';

interface INexusGameEntry {
  id: number;
  domain_name: string;
  name: string;
}

interface IAddGameProps {
  visible: boolean;
  onHide: () => void;
  nexusGames: INexusGameEntry[];
  storeGames: { [storeId: string]: types.IGameStoreEntry[] };
  onSave: (spec: IGameSpec, imageUrl: string) => Promise<void>;
}

type ValidationState = 'success' | 'warning' | 'error';

interface IValidationResult {
  state: ValidationState;
  reason?: string;
}

interface IFormLineProps {
  t: (input: string) => string;
  controlId: string;
  title: string;
  children: React.ReactNode;
  validationFunc?: () => IValidationResult;
}

function FormLine(props: IFormLineProps) {
  const { t, children, controlId, title, validationFunc } = props;
  const { state, reason } = validationFunc?.() || {};
  return (
    <FormGroup
      controlId={controlId}
      className="form-line"
      validationState={state}
    >
      <Col sm={3}>
        <ControlLabel>{title}</ControlLabel>
      </Col>
      <Col sm={9}>{children}</Col>
      {reason !== undefined ? <HelpBlock>{t(reason)}</HelpBlock> : null}
    </FormGroup>
  );
}

interface IAutosuggestProps {
  options: string[];
  value: string;
  placeholder: string;
  onChange: (newValue: string) => void;
}

function Suggestion(props: {
  value: string;
  onChange: (newValue: string) => void;
}) {
  return (
    <div>
      <a onClick={() => props.onChange(props.value)}>{props.value}</a>
    </div>
  );
}

interface IFormPathItemProps {
  t: TFunction;
  label: string;
  value: string;
  onChange: (newValue: string) => void;
}

// mostly copy&paste from Vortex core because it's not exported atm
function FormPathItem(props: IFormPathItemProps): JSX.Element {
  const { t, label, value, onChange } = props;

  const onChangeEvt = React.useCallback((evt: React.FormEvent<any>) => {
    onChange(evt.currentTarget.value);
  }, [onChange]);

  const onChangeEdit = React.useCallback(async () => {
    const { remote } = require('electron');

    const res = await remote.dialog.showOpenDialog(remote.getCurrentWindow(), {
      defaultPath: value,
      properties: [ 'openDirectory' ],
    });

    if (res.filePaths !== undefined) {
      onChange(res.filePaths);
    }
  }, []);

  return (
    <FormGroup>
      <Col sm={3} className='ag-form-label'>
        {label}
      </Col>
      <Col sm={9} className='ag-form-value'>
        <InputGroup>
          <FormControl
            type='text'
            value={value}
            onChange={onChangeEvt}
          />
          <InputGroup.Button className='inset-btn'>
            <tooltip.IconButton
              id='change-tool-path'
              tooltip={t('Change')}
              onClick={onChangeEdit}
              icon='browse'
            />
          </InputGroup.Button>
        </InputGroup>
      </Col>
    </FormGroup>
  );
}

interface IPathInputProps {
  value: string;
  placeholder: string;
  defaultpath?: string;
  selectFile?: boolean;
  filters?: types.IFileFilter[];
  onChange: (value: string) => void;
  api: types.IExtensionApi;
}

function PathInput(props: IPathInputProps) {
  const browseCB = React.useCallback(() => {
    let prom: Promise<string>;
    const options: types.IOpenOptions = {
      defaultPath: props.defaultpath,
      create: false,
      filters: props.filters,
    };
    if (props.selectFile === true) {
      prom = props.api.selectFile(options);
    } else {
      prom = props.api.selectDir(options);
    }

    prom.then((selectedPath: string) => {
      if (selectedPath) {
        props.onChange(selectedPath);
      }
    });
  }, [props.onChange, props.defaultpath, props.selectFile]);

  const changeCB = React.useCallback(
    (evt: React.FormEvent<any>) => {
      props.onChange(evt.currentTarget.value);
    },
    [props.onChange],
  );

  return (
    <InputGroup>
      <FormControl
        className='add-game-path-input'
        value={props.value}
        placeholder={props.placeholder}
        onChange={changeCB}
      />
      <InputGroup.Button className='inset-btn'>
        <Button onClick={browseCB}>
          <Icon name='browse' />
        </Button>
      </InputGroup.Button>
    </InputGroup>
  );
}

function delayed(func: (...args: any[]) => void) {
  return (...args: any[]) => {
    setTimeout(() => {
      func(...args);
    }, 1000);
  };
}

function InputAutosuggest(props: IAutosuggestProps) {
  const [focused, setFocus] = React.useState(false);

  const suggestions =
    focused && (props.value || '').length > 1
      ? (props.options || []).filter((opt) => opt.includes(props.value))
      : [];

  const hit = suggestions.length === 1 && suggestions[0] === props.value;

  return (
    <>
      <FormInput
        placeholder={props.placeholder}
        value={props.value}
        onFocus={delayed(setFocus)}
        onChange={props.onChange}
      />
      {suggestions.length === 0 || hit ? null : (
        <div className='suggestions'>
          {suggestions.map((sugg) => (
            <Suggestion key={sugg} value={sugg} onChange={props.onChange} />
          ))}
        </div>
      )}
    </>
  );
}

interface IStopPattern {
  id: string;
  value: string;
}

interface IModTypeProps {
  t: TFunction;
  spec: IModTypeSpec;
  onRemove: (id: string) => void;
  onUpdate: (spec: IModTypeSpec) => void;
}

function ModType(props: IModTypeProps): JSX.Element {
  const { t, spec, onRemove, onUpdate } = props;

  const setName = React.useCallback(
    (name: string) => onUpdate({ ...spec, name }),
    [spec, onUpdate],
  );
  const setPath = React.useCallback(
    (targetPath: string) => onUpdate({ ...spec, targetPath }),
    [spec, onUpdate],
  );

  const remove = React.useCallback(() =>  {
    onRemove(spec.id)
  }, [spec, onRemove]);

  return (
    <ListGroupItem className='add-game-mod-type'>
      <FlexLayout type='row' style={{ alignItems: 'center' }}>
        <FlexLayout.Flex>
          <FormLine t={t} controlId='add-game-modtype-name' title={t('Name')}>
            <FormInput className='layout-flex' label={t('Name')} value={spec.name} onChange={setName}/>
          </FormLine>
          <FormPathItem t={t} label={t('Path')} value={spec.targetPath} onChange={setPath} />
        </FlexLayout.Flex>
        <FlexLayout.Fixed>
          <tooltip.IconButton icon='delete' tooltip={t('Remove')} onClick={remove} />
        </FlexLayout.Fixed>
      </FlexLayout>
    </ListGroupItem>
  );
}

interface IStopPatternProps {
  t: TFunction;
  pattern: IStopPattern;
  onRemove: (id: string) => void;
  onUpdate: (pattern: IStopPattern) => void;
}

function StopPattern(props: IStopPatternProps): JSX.Element {
  const { t, pattern, onRemove, onUpdate } = props;

  const setValue = React.useCallback(
    (value: string) => onUpdate({ ...pattern, value }),
    [pattern, onUpdate],
  );

  const remove = React.useCallback(() =>  {
    onRemove(pattern.id)
  }, [pattern, onRemove]);

  return (
    <ListGroupItem className='add-game-stop-pattern'>
      <FormInput className='layout-flex' label={t('Name')} value={pattern.value} onChange={setValue}/>
      <tooltip.IconButton icon='delete' tooltip={t('Remove')} onClick={remove} />
    </ListGroupItem>
  );
}

function nop() {}

type StepT = 'intro' | 'references' | 'info' | 'technical' | 'modtypes' | 'review';

const STEPS: StepT[] = [
  'intro',
  'references',
  'info',
  'technical',
  'modtypes',
  'review',
];

interface IAddGameState {
  values: { [key: string]: any };
  step: StepT;
  working: boolean;
}

type IProps = IAddGameProps & WithTranslation;

class AddGameDialog extends ComponentEx<IProps, IAddGameState> {
  private mChangeFuncs: { [key: string]: (newValue: any) => void } = {};
  private mCallbacks: { [key: string]: () => Promise<void> };

  constructor(props: IProps) {
    super(props);

    this.initState({
      values: {},
      step: 'intro',
      working: false,
    });

    this.mCallbacks = {
      info: () => this.onEnterInfo(),
    };
  }

  public render(): JSX.Element {
    const { t, visible, onHide } = this.props;
    const { step, working } = this.state;

    const page = {
      intro: () => this.renderIntro(),
      references: () => this.renderReferences(),
      info: () => this.renderInfo(),
      technical: () => this.renderTechnical(),
      modtypes: () => this.renderModType(),
      review: () => this.renderReview(),
    }[step];

    return (
      <Modal show={visible} onHide={nop} id='add-game-dialog'>
        <Modal.Header>
          <Modal.Title>{t('Add a game')}</Modal.Title>
          {this.renderStep(step)}
        </Modal.Header>
        <Modal.Body>{working ? this.renderWorking() : page()}</Modal.Body>
        <Modal.Footer>
          <Button onClick={this.cancel}>{t('Cancel')}</Button>
          {(step === 'intro') ? null : <Button onClick={this.back}>{t('Back')}</Button>}
          {step === STEPS[STEPS.length - 1] ? (
            <Button onClick={this.save}>{t('Save')}</Button>
          ) : (
            <Button onClick={this.next}>{t('Next')}</Button>
          )}
        </Modal.Footer>
      </Modal>
    );
  }

  private renderStep(step: StepT): JSX.Element {
    const { t } = this.props;
    return (
      <Steps step={step} style={{ marginBottom: 32 }}>
        <Steps.Step
          key='intro'
          stepId='intro'
          title={t('Introduction')}
          description={t('Introduction')}
        />
        <Steps.Step
          key='references'
          stepId='references'
          title={t('References')}
          description={t('The game on other platforms')}
        />
        <Steps.Step
          key='info'
          stepId='info'
          title={t('Info')}
          description={t('Base game information')}
        />
        <Steps.Step
          key='technical'
          stepId='technical'
          title={t('Technical')}
          description={t('Technical details')}
        />
        <Steps.Step
          key='modtypes'
          stepId='modtypes'
          title={t('Mod Types')}
          description={t('Mod Types')}
        />
        <Steps.Step
          key='review'
          stepId='review'
          title={t('Review')}
          description={t('Creation result')}
        />
      </Steps>
    );
  }

  private renderWorking() {
    return (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Spinner />
      </div>
    );
  }

  private renderIntro() {
    const { t } = this.props;
    return (
      <div style={{ display: 'flex', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
        {t('This wizard helps you add new games to Vortex that aren\'t currently supported.')}
        <br/><br/>
        {t('Please note that in many cases there is more to modding than putting some files '
          + 'into some directory, e.g. it may involve changing configuration files or running '
          + 'additional tools.')}
        <br/>
        {t('You can integrate such functionality into Vortex but it is beyond the scope '
          + 'of this wizard. This is focused on providing base functionality (without coding) '
          + 'on which you can then build upon if you like.')}
      </div>
    );
  }

  private renderReferences() {
    const { t, nexusGames, storeGames } = this.props;
    const { values } = this.state;

    let options: Array<{ label: string; value: string }> = [];

    Object.keys(storeGames).forEach((storeId) => {
      storeGames[storeId].forEach((gameEntry) => {
        if (gameEntry.name !== undefined) {
          options.push({
            label: gameEntry.name,
            value: `${storeId}:${gameEntry.appid}`,
          });
        } else {
          log('warn', 'invalid game entry', JSON.stringify(gameEntry));
        }
      });
    });

    options = options.sort((lhs, rhs) => lhs.label.localeCompare(rhs.label));

    return (
      <Form horizontal>
        <HelpBlock>
          {t(
            'First, please select which game you want to add the catalog ' +
              'of games supported on www.nexusmods.com and games installed ' +
              'through launchers (Steam, ...) on your system.',
          )}
          <br />
          {t(
            'Both are optional but if they apply we can fill out much ' +
              'of the information required automatically.',
          )}
        </HelpBlock>
        <FormLine
          t={t}
          controlId='add-game-nexusdomain'
          title={t('Nexus Domain')}
          validationFunc={this.validateDomain}
        >
          <InputAutosuggest
            options={nexusGames.map((game) => game.domain_name)}
            placeholder='Nexus Domain'
            value={values['nexus_domain']}
            onChange={this.changeFunc('nexus_domain')}
          />
        </FormLine>
        <FormLine t={t} controlId='add-game-storegames' title={t('Game')}>
          <Select
            className='select-compact'
            options={options}
            value={values['store_game'] || ''}
            onChange={this.changeFunc('store_game', (input) => input.value)}
          />
        </FormLine>
      </Form>
    );
  }

  private renderInfo() {
    const { t } = this.props;
    const { values } = this.state;

    return (
      <Form horizontal>
        <FormLine
          t={t}
          controlId='add-game-name'
          title={t('Name')}
          validationFunc={this.validateName}
        >
          <FormInput
            placeholder='Game Name'
            value={values['name']}
            onChange={this.changeFunc('name')}
          />
        </FormLine>
        <FormLine t={t} controlId='game-image' title={t('Image')}>
          <img className='gameicon' src={values['image_url']} />
          <FormInput
            value={values['image_url']}
            onChange={this.changeFunc('image_url')}
            debounceTimer={5000}
          />
        </FormLine>
        <HelpBlock>
          {t(
            'Please use an image in 16:9 format to fit into the grid ' +
              'inside Vortex.',
          )}
        </HelpBlock>
        <FormLine
          t={t}
          controlId='game-path'
          title={t('Game Path')}
          validationFunc={this.validateGamePath}
        >
          <PathInput
            api={this.context.api}
            value={values['game_path']}
            placeholder={t('Select path where the game is installed')}
            onChange={this.changeFunc('game_path')}
          />
        </FormLine>
        <FormLine t={t} controlId='mod-path' title={t('Mod Path')}>
          <PathInput
            api={this.context.api}
            defaultpath={values['game_path']}
            value={values['mod_path']}
            placeholder={t('Select path where mods get installed')}
            onChange={this.changeFunc('mod_path')}
          />
        </FormLine>
        <Usage infoId='add-game-mod-path' persistent>
          {t(
            'Some games require mods to be installed in different directories. ' +
              'If this is the case, please select the most commonly used path, ' +
              'you will be able to set up additional mod types later on. ',
          )}
          {t(
            'If you select nothing, mods get installed into the base ' +
              'folder of the game.',
          )}
        </Usage>
        <FormLine
          t={t}
          controlId='exe-path'
          title={t('Executable')}
          validationFunc={this.validateExePath}
        >
          <PathInput
            api={this.context.api}
            defaultpath={values['game_path']}
            value={values['exe_path']}
            placeholder={t('Select the executable used to start this game')}
            onChange={this.changeFunc('exe_path')}
            selectFile
            filters={[
              { name: 'Executables', extensions: ['exe', 'cmd', 'bat'] },
            ]}
          />
        </FormLine>
      </Form>
    );
  }

  private renderTechnical() {
    const { t } = this.props;
    const { values } = this.state;

    return (
      <Form horizontal>
        <FormLine t={t} controlId='add-game-merge-mods' title={t('Merge Mods')}>
          <Toggle
            checked={values['merge_mods'] ?? true}
            onToggle={this.changeFunc('merge_mods')}
          />
        </FormLine>
        <Usage infoId='add-game-merge' persistent>
          {t(
            'Most games expect all mods to be installed into a single directory. Tther times all mods ' +
            'are distributed by their authors such that the mod archive always includes a subdirectory. ' +
            'In both cases you want this option *enabled*.')}
          <br/><br/>
          {t('If however you want Vortex to ensure ' +
              'that each mod gets deployed into a separate directory, disable this option. ' +
              'You can also take control over how these directories are named but that requires coding.',
          )}
        </Usage>
        <ControlLabel>{t('Stop Pattern')}</ControlLabel>
        <ListGroup>
          {(values['stop_patterns'] || []).map((pattern: IStopPattern) => (
            <StopPattern
              t={t}
              key={pattern.id}
              pattern={pattern}
              onUpdate={this.updateStopPattern}
              onRemove={this.removeStopPattern}
            />
          ))}
          <ListGroupItem>
            <Button onClick={this.addStopPattern}>{t('Add Stop-pattern')}</Button>
          </ListGroupItem>
        </ListGroup>
        <Usage infoId='add-game-stoppattern' persistent>
          {t('Mod Authors may not package their mods consistently.')}
          <br/>
          {t('Say a skyrim mod with the file foobar.esp needs to be installed to <game path>\\data')}
          {t('It  may be packaged inside the archive directly as "foobar.esp" or with intermediate ' +
            'directories like "data\\foobar.esp" or "my foobar mod\\data\\foobar.esp".')}
          <br/>
          {t('"Stop patterns" help Vortex recognize the files or directories that should go into the mod directory ' +
            '(as configured before) and find them inside the archive no matter how it\'s packaged.')}
          <br/>
          {t('These patterns can use wildcards, e.g. "*.esp", "*.bsa" or name directories or special files directly, e.g. ' +
            '"textures", "manifest.json"')}
          {t('If this is not enough to untangle the mod archives for this game more complex mechanisms are possible ' +
             'but require coding.')}
        </Usage>
      </Form>
    );
  }

  private renderModType() {
    const { t } = this.props;
    const { values } = this.state;
    return (
      <div style={{ width: '100%', height: '100%' }}>
        <HelpBlock>
          {t(
            'Mod Types are for cases where the game has different types of mods that need to ' +
              'be installed to different locations. An example would be Witcher 3, where some mods ' +
              'get installed to the game folder and others need to go into the "My Documents" folder.',
          )}
          <br />
          {t(
            "For most game it's safe to leave this empty, please don't use mod types if you " +
              "don't have to as there is a performance overhead involved and it may limit " +
              'the availabilty of deployment methods for the game.',
          )}
        </HelpBlock>
        <ListGroup>
          {(values['mod_types'] || []).map((type: IModTypeSpec) => (
            <ModType t={t} key={type.id} spec={type} onUpdate={this.updateModType} onRemove={this.removeModType} />
          ))}
          <ListGroupItem>
            <Button onClick={this.addEmptyModType}>{t('Add Mod Type')}</Button>
          </ListGroupItem>
        </ListGroup>
      </div>
    );
  }

  private renderReview() {
    const { t } = this.props;
    return (
      <div style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center'
      }}>
        <Icon name='feedback-success'/>
        <div style={{ fontSize: 'larger' }}>
          {t(
            'All done. You will have to restart Vortex for the game to show up.',
          )}
        </div>
      </div>
    );
  }

  private cancel = () => {
    this.nextState.step = 'intro';
    this.nextState.values = {};
    this.props.onHide();
  };

  private deduceId() {
    const { values } = this.state;
    if (values['nexus_domain'] !== undefined) {
      return values['nexus_domain'];
    }

    return (values['name'] as string).toLowerCase().replace(/[ -_]/g, '');
  }

  private save = async () => {
    const { storeGames } = this.props;
    const { values } = this.state;

    const executable = path.relative(values['game_path'], values['exe_path']);
    const id = this.deduceId();
    const imageName = values['image_url'] !== undefined
      ? `${id}${path.extname(values['image_url'])}`
      : 'gameart.jpg';
    const res: IGameSpec = {
      game: {
        id,
        name: values['name'],
        executable,
        logo: imageName,
        mergeMods: values['merge_mods'] ?? true,
        modPath: values['mod_path'],
        modPathIsRelative: false,
        requiredFiles: [executable],
        details: {},
        environment: {},
      },
      modTypes: values['mod_types'],
      discovery: {
        ids: [],
        names: [],
      },
    };

    let modPathRelative = path.relative(
      values['game_path'],
      values['mod_path'] ?? values['game_path'],
    );

    if (modPathRelative === '') {
      modPathRelative = '.';
    }
    if (!modPathRelative.startsWith('..')) {
      res.game.modPathIsRelative = true;
      res.game.modPath = modPathRelative;
    }

    if (values['store_game'] !== undefined) {
      const [storeId, appId] = values['store_game'].split(':');
      const storeInfo = (storeGames[storeId] || []).find(
        (entry) => entry.appid === appId,
      );

      res.discovery.ids.push(appId);

      if (storeId === 'steam') {
        res.game.environment['SteamAPPId'] = appId;
        res.game.details['steamAppId'] = parseInt(appId, 10);
      }
      if (values['nexus_domain'] !== undefined) {
        res.game.details['nexusPageId'] = values['nexus_domain'];
      }
    }

    if (values['stop_patterns'] !== undefined) {
      res.game.details['stopPatterns'] = values['stop_patterns'].map(pat => pat.value);
    }

    this.nextState.working = true;
    await this.props.onSave(res, values['image_url']);
    this.nextState.working = false;
    this.nextState.step = 'intro';
    this.nextState.values = {};
    this.props.onHide();
  };

  private back = () => {
    const currentIdx = STEPS.indexOf(this.state.step);
    const nextStep = STEPS[currentIdx - 1];
    this.nextState.step = nextStep;
    if (this.mCallbacks[nextStep] !== undefined) {
      this.nextState.working = true;
      this.mCallbacks[nextStep]().then(() => {
        this.nextState.working = false;
      });
    }
  }

  private next = () => {
    const currentIdx = STEPS.indexOf(this.state.step);
    const nextStep = STEPS[currentIdx + 1];
    this.nextState.step = nextStep;
    if (this.mCallbacks[nextStep] !== undefined) {
      this.nextState.working = true;
      this.mCallbacks[nextStep]().then(() => {
        this.nextState.working = false;
      });
    }
  };

  private onEnterInfo() {
    const { nexusGames, storeGames } = this.props;
    const { values } = this.state;

    const setIfEmpty = (key: string, value: any) => {
      if (values[key] === undefined) {
        this.nextState.values[key] = value;
      }
    };

    const nexusInfo = nexusGames.find(
      (game) => game.domain_name === values['nexus_domain'],
    );
    let storeInfo: types.IGameStoreEntry;
    if (values['store_game'] !== undefined) {
      const [storeId, appId] = values['store_game'].split(':');
      storeInfo = (storeGames[storeId] || []).find(
        (entry) => entry.appid === appId,
      );
    }

    if (storeInfo !== undefined) {
      setIfEmpty('name', storeInfo.name);
      setIfEmpty('game_path', storeInfo.gamePath);
    }

    if (nexusInfo !== undefined) {
      setIfEmpty('name', nexusInfo.name);
      setIfEmpty(
        'image_url',
        `https://staticdelivery.nexusmods.com/Images/games/cover_${nexusInfo.id}.jpg`,
      );
    }

    return Promise.resolve();
  }

  private addEmptyModType = () => {
    const emptyType: IModTypeSpec = {
      id: `${this.deduceId()}-${shortid()}`,
      name: 'New Mod Type',
      priority: 'high',
      targetPath: this.state.values['game_path'],
    };
    if (this.nextState.values['mod_types'] === undefined) {
      this.nextState.values['mod_types'] = [emptyType];
    } else {
      this.nextState.values['mod_types'].push(emptyType);
    }
  }

  private removeModType = (typeId: string) => {
    const idx = this.state.values['mod_types'].findIndex(type => type.id === typeId);
    if (idx !== -1) {
      this.nextState.values['mod_types'].splice(idx, 1);
    }
  }

  private updateModType = (newType: IModTypeSpec) => {
    const { values } = this.state;
    const idx = values['mod_types'].findIndex((type: IModTypeSpec) => type.id === newType.id);
    if (idx === -1) {
      this.nextState.values['mod_types'].push(newType);
    } else {
      this.nextState.values['mod_types'][idx] = newType;
    }
  }

  private addStopPattern = () => {
    const emptyPattern: IStopPattern = {
      id: shortid(),
      value: 'sample*.pak',
    };
    if (this.nextState.values['stop_patterns'] === undefined) {
      this.nextState.values['stop_patterns'] = [emptyPattern];
    } else {
      this.nextState.values['stop_patterns'].push(emptyPattern);
    }
  }

  private removeStopPattern = (patternId: string) => {
    const idx = this.state.values['stop_patterns'].findIndex(type => type.id === patternId);
    if (idx !== -1) {
      this.nextState.values['stop_patterns'].splice(idx, 1);
    }
  }

  private updateStopPattern = (pattern: IStopPattern) => {
    const { values } = this.state;
    const idx = values['stop_patterns'].findIndex((iter: IStopPattern) => iter.id === pattern.id);
    if (idx === -1) {
      this.nextState.values['stop_patterns'].push(pattern);
    } else {
      this.nextState.values['stop_patterns'][idx] = pattern;
    }
  }

  private changeFunc(key: string, mapper?: (input: any) => any) {
    if (this.mChangeFuncs[key] === undefined) {
      this.mChangeFuncs[key] = (newValue: any) => {
        console.log('change', key, newValue);
        if (mapper !== undefined) {
          this.nextState.values[key] = mapper(newValue);
        } else {
          this.nextState.values[key] = newValue;
        }
      };
    }

    return this.mChangeFuncs[key];
  }

  private validateName = (): IValidationResult => {
    if ((this.state.values['name'] || '').length === 0) {
      return {
        state: 'error',
        reason:
          "Can't be empty. Please use the proper game name formatted " +
          'like the developer company advertises it.',
      };
    } else {
      return {
        state: 'success',
      };
    }
  };

  private validateDomain = (): IValidationResult => {
    if ((this.state.values['nexus_domain'] || '').length === 0) {
      return {
        state: 'warning',
        reason:
          'If this game exists on nexusmods.com, please enter the part ' +
          'of the url that idenfies the game, for example in ' +
          'https://www.nexusmods.com/newvegas it would be "newvegas". ' +
          'If the game is not on Nexus Mods you can leave this empty.',
      };
    } else {
      return {
        state: 'success',
      };
    }
  };

  private validateGamePath = (): IValidationResult => {
    if ((this.state.values['game_path'] || '').length === 0) {
      return {
        state: 'error',
        reason:
          'Please select the top-most folder of the game, meaning the ' +
          'folder that contains within it the entire game, *not* just ' +
          'the executable.',
      };
    } else {
      return {
        state: 'success',
      };
    }
  };

  private validateExePath = (): IValidationResult => {
    const { values } = this.state;
    if ((values['exe_path'] || '').length === 0) {
      return {
        state: 'error',
        reason:
          "Can't be empty, please select the executable to start the " +
          'game with',
      };
    } else if (
      path.relative(values['game_path'], values['exe_path']).startsWith('..')
    ) {
      return {
        state: 'error',
        reason: 'Surely the executable should be inside the game directory???',
      };
    } else {
      return {
        state: 'success',
      };
    }
  };
}

export default withTranslation(['add-game', 'default'])(AddGameDialog);
