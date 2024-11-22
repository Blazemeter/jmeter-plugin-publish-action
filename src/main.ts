import { info, setFailed, setOutput } from '@actions/core'
import { Arguments } from './args.js'
import { GitService } from './git.js'
import { GithubService } from './github.js'
import { ReleaseBuilder } from './release-builder.js'
import type { Plugin, PluginVersion } from './jmeter-plugins.d.js'
import { writeFileSync } from 'fs'

const REPOSITORY_NAME = 'jmeter-plugins'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const args: Arguments = new Arguments()
    const gitHandler: GitService = new GitService(args)
    await gitHandler.init(REPOSITORY_NAME)
    const githubService: GithubService = await GithubService.getInstance(args.githubToken)
    const releaseBuilder: ReleaseBuilder = new ReleaseBuilder(args, githubService.getAssets())
    const release: PluginVersion = await releaseBuilder.build()
    const version: string = githubService.getReleaseVersion()
    await applyRelease(
      await releaseBuilder.findFilePluginRepository(),
      release,
      args.pluginID,
      version
    )
    const releaseBranch: string = await gitHandler.checkoutReleaseBranch(version, REPOSITORY_NAME)
    await gitHandler.commitChanges(version, REPOSITORY_NAME)
    await gitHandler.pushChanges(releaseBranch, REPOSITORY_NAME)
    const prUrl: string = await githubService.openPullRequest(
      args.upstreamRepository,
      args.forkedRepository,
      releaseBranch
    )
    setOutput('pull_request', prUrl)
  } catch (error) {
    if (error instanceof Error) setFailed(error.message)
  }

  async function applyRelease(
    releaseFile: string,
    release: PluginVersion,
    pluginID: string,
    releaseVersion: string
  ): Promise<void> {
    const plugins: Plugin[] = await ReleaseBuilder.readPluginsFromFile(releaseFile)
    const plugin: Plugin | undefined = plugins.find(p => p.id === pluginID)
    if (plugin) {
      plugin.versions[releaseVersion] = release
      writeFileSync(releaseFile, JSON.stringify(plugins, null, 2), 'utf-8')
      info(`Release Object: ${JSON.stringify(release)}`)
      return
    }
    throw Error(`The plugin id:"${pluginID}" was not found in ${releaseFile}`)
  }
}
