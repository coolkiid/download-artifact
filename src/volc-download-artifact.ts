import * as os from 'os'
import * as path from 'path'
import * as core from '@actions/core'
import artifactClient from '@actions/artifact'
import type {Artifact, FindOptions} from '@actions/artifact'
import {Minimatch} from 'minimatch'
import {Inputs, Outputs} from './constants'

async function run(): Promise<void> {
  const inputs = {
    name: core.getInput(Inputs.Name, {required: false}),
    path: core.getInput(Inputs.Path, {required: false}),
    token: core.getInput(Inputs.GitHubToken, {required: false}),
    repository: core.getInput(Inputs.Repository, {required: false}),
    runID: parseInt(core.getInput(Inputs.RunID, {required: false})),
    pattern: core.getInput(Inputs.Pattern, {required: false}),
    mergeMultiple: core.getBooleanInput(Inputs.MergeMultiple, {required: false})
  }

  if (!inputs.path) {
    inputs.path = process.env['GITHUB_WORKSPACE'] || process.cwd()
  }

  if (inputs.path.startsWith(`~`)) {
    inputs.path = inputs.path.replace('~', os.homedir())
  }

  const isSingleArtifactDownload = !!inputs.name
  const resolvedPath = path.resolve(inputs.path)
  core.debug(`Resolved path is ${resolvedPath}`)

  const options: FindOptions = {}

  let artifacts: Artifact[] = []

  if (isSingleArtifactDownload) {
    core.info(`Downloading single artifact`)

    const {artifact: targetArtifact} = await artifactClient.getArtifact(
      inputs.name,
      options
    )

    if (!targetArtifact) {
      throw new Error(`Artifact '${inputs.name}' not found`)
    }

    core.debug(
      `Found named artifact '${inputs.name}' (ID: ${targetArtifact.id}, Size: ${targetArtifact.size})`
    )

    artifacts = [targetArtifact]
  } else {
    const listArtifactResponse = await artifactClient.listArtifacts({
      latest: true,
      ...options
    })
    artifacts = listArtifactResponse.artifacts

    core.debug(`Found ${artifacts.length} artifacts in run`)

    if (inputs.pattern) {
      core.info(`Filtering artifacts by pattern '${inputs.pattern}'`)
      const matcher = new Minimatch(inputs.pattern)
      artifacts = artifacts.filter(artifact => matcher.match(artifact.name))
      core.debug(
        `Filtered from ${listArtifactResponse.artifacts.length} to ${artifacts.length} artifacts`
      )
    } else {
      core.info(
        'No input name or pattern filtered specified, downloading all artifacts'
      )
      if (!inputs.mergeMultiple) {
        core.info(
          'An extra directory with the artifact name will be created for each download'
        )
      }
    }
  }

  if (artifacts.length) {
    core.info(`Preparing to download the following artifacts:`)
    artifacts.forEach(artifact => {
      core.info(
        `- ${artifact.name} (ID: ${artifact.id}, Size: ${artifact.size})`
      )
    })
  }

  for (const artifact of artifacts) {
    await artifactClient.downloadArtifact(artifact.id, {
      ...options,
      path: inputs.mergeMultiple
        ? resolvedPath
        : path.join(resolvedPath, artifact.name),
      artifactName: artifact.name
    })
  }

  core.info(`Total of ${artifacts.length} artifact(s) downloaded`)
  core.setOutput(Outputs.DownloadPath, resolvedPath)
  core.info('Download artifact has finished successfully')
}

run().catch(err =>
  core.setFailed(`Unable to download artifact(s): ${err.message}`)
)
