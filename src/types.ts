import { types } from "vortex-api";

export type Priority = 'high' | 'low';

export interface IModTypeSpec {
  priority: Priority;
  id: string;
  name: string;
  targetPath: string;
}

export interface IDiscoverySpec {
  ids: string[];
  names: string[];
}

export interface IGame extends Omit<types.IGame, 'queryPath' | 'queryModPath' | 'executable'> {
  modPath: string;
  modPathIsRelative: boolean;
  executable: string;
}

export interface IGameSpec {
  game: IGame;
  discovery: IDiscoverySpec;
  modTypes?: IModTypeSpec[];
}
