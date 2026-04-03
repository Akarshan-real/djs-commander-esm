import { Client, APIApplicationCommand } from 'discord.js';
import { Logger } from 'winston';

export class CommandHandler {
  constructor(options: CommandHandlerOptions);
  public get commands(): LocalCommand[];
}

export interface CommandHandlerOptions {
  client: Client;
  commandsPath?: string;
  eventsPath?: string;
  validationsPath?: string;
  testServer?: string;
  logger?: Logger;
}

export interface LocalCommand extends APIApplicationCommand {
  deleted?: boolean;
  [key: string]: any;
}