import { getFilePaths } from './getPaths.js';
import { pathToFileURL } from 'url';

export async function buildCommandTree(commandsDir?: string) {
  const commandTree = [];

  if (!commandsDir) return [];

  const commandFilePaths = getFilePaths(commandsDir, true);

  for (const commandFilePath of commandFilePaths) {
    const fileURL = pathToFileURL(commandFilePath).href;
    const importedModule = await import(fileURL);
    
    let { data, run, deleted, ...rest } = importedModule.default || importedModule;

    if (!data) throw new Error(`File ${commandFilePath} must export "data".`);
    if (!run) throw new Error(`File ${commandFilePath} must export a "run" function.`);
    if (!data.name) throw new Error(`File ${commandFilePath} must have a command name.`);
    if (!data.description) throw new Error(`File ${commandFilePath} must have a command description.`);

    try {
      data = data.toJSON();
    } catch (error) {}

    commandTree.push({
      ...data,
      ...rest,
      deleted,
      run,
    });
  }

  return commandTree;
}