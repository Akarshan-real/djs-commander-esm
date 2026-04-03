import { Client } from 'discord.js';
import { Logger } from 'winston';
import { LocalCommand } from './dev.js';
import { getFolderPaths, getFilePaths } from './utils/getPaths.js';
import { buildCommandTree } from './utils/buildCommandTree.js';
import { registerCommands } from './utils/registerCommands.js';
import { pathToFileURL } from 'url';

export class CommandHandler {
  private readonly _client: Client;
  private readonly _commandsPath: string | undefined;
  private readonly _eventsPath: string | undefined;
  private readonly _validationsPath: string | undefined;
  private readonly _testServer: string | undefined;
  private readonly _validationFuncs: Array<Function>;
  private readonly _logger: Logger | undefined;
  private _commands: Array<LocalCommand>;

  constructor({
    client,
    commandsPath,
    eventsPath,
    validationsPath,
    testServer,
    logger,
  }: {
    client: Client;
    commandsPath?: string;
    eventsPath?: string;
    validationsPath?: string;
    testServer?: string;
    logger?: Logger;
  }) {
    if (!client)
      throw new Error('Property "client" is required when instantiating CommandHandler.');

    this._client = client;
    this._commandsPath = commandsPath;
    this._eventsPath = eventsPath;
    this._validationsPath = validationsPath;
    this._testServer = testServer;
    this._commands = [];
    this._validationFuncs = [];
    this._logger = logger;

    if (this._validationsPath && !commandsPath) {
      throw new Error(
        'Command validations are only available in the presence of a commands path. Either add "commandsPath" or remove "validationsPath"'
      );
    }

    if (this._commandsPath) {
      this._client.once('ready', async () => {
        await this._commandsInit();
        await this._registerSlashCommands();
        if (this._validationsPath) {
          await this._validationsInit();
        }
        this._handleCommands();
      });
    }

    if (this._eventsPath) {
      this._eventsInit();
    }
  }

  async _commandsInit() {
    let commands = await buildCommandTree(this._commandsPath);
    this._commands = commands;
  }

  async _registerSlashCommands() {
    await registerCommands({
      client: this._client,
      commands: this._commands,
      testServer: this._testServer,
      logger: this._logger,
    });
  }

  _eventsInit() {
    const eventPaths = getFolderPaths(this._eventsPath);

    for (const eventPath of eventPaths) {
      const eventName = eventPath.replace(/\\/g, '/').split('/').pop();
      const eventFuncPaths = getFilePaths(eventPath, true);
      eventFuncPaths.sort();

      if (!eventName) continue;

      this._client.on(eventName, async (...arg) => {
        for (const eventFuncPath of eventFuncPaths) {
          const fileURL = pathToFileURL(eventFuncPath).href;
          const importedModule = await import(fileURL);
          const eventFunc = importedModule.default || importedModule;
          
          const cantRunEvent = await eventFunc(...arg, this._client, this);
          if (cantRunEvent) break;
        }
      });
    }
  }

  async _validationsInit() {
    const validationFilePaths = getFilePaths(this._validationsPath);
    validationFilePaths.sort();

    for (const validationFilePath of validationFilePaths) {
      const fileURL = pathToFileURL(validationFilePath).href;
      const importedModule = await import(fileURL);
      const validationFunc = importedModule.default || importedModule;

      if (typeof validationFunc !== 'function') {
        throw new Error(`Validation file ${validationFilePath} must export a function by default.`);
      }

      this._validationFuncs.push(validationFunc);
    }
  }

  _handleCommands() {
    this._client.on('interactionCreate', async (interaction) => {
      if (!interaction.isChatInputCommand()) return;

      const command = this._commands.find((cmd) => cmd.name === interaction.commandName);
      if (command) {
        if (this._validationFuncs.length) {
          let canRun = true;

          for (const validationFunc of this._validationFuncs) {
            const cantRunCommand = await validationFunc(interaction, command, this, this._client);
            if (cantRunCommand) {
              canRun = false;
              break;
            }
          }

          if (canRun) {
            await command.run({
              interaction,
              client: this._client,
              handler: this,
            });
          }
        } else {
          await command.run({
            interaction,
            client: this._client,
            handler: this,
          });
        }
      }
    });
  }

  get commands() {
    return this._commands;
  }
}