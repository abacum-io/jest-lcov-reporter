// @ts-check
import { promises as fs } from "fs"
import core from "@actions/core"
// import sh from 'run-sh';
import { getOctokit, context } from "@actions/github"

import { parse, percentage } from "./lcov"
import { commentIdentifier, diff } from "./comment"

async function main() {
	const token = core.getInput("github-token")
	const name = core.getInput("name")
	const lcovFile = core.getInput("lcov-file") || "./coverage/lcov.info"
	const baseFile = core.getInput("lcov-base")
	const updateComment = core.getBooleanInput("update-comment")
	const showChangedFiles = core.getBooleanInput("show-changed-files")
	const rawMinCoverage = core.getInput("min-coverage")
	const shouldSkipCoverageCheck = core.getInput('excludeLabels') || []

	const minCoverage = rawMinCoverage ? parseFloat(rawMinCoverage) : 0

	const raw = await fs.readFile(lcovFile, "utf-8").catch((err) => null)
	if (!raw) {
		console.log(`No coverage report found at '${lcovFile}', exiting...`)
		return
	}

	const baseRaw =
		baseFile && (await fs.readFile(baseFile, "utf-8").catch((err) => null))
	if (baseFile && !baseRaw) {
		console.log(`No coverage report found at '${baseFile}', ignoring...`)
	}

	const isPullRequest = Boolean(context.payload.pull_request)
	if (!isPullRequest) {
		console.log("Not a pull request, skipping...")
		return
	}

	console.log("this is @@@@@@@@@@@@@@@@@@@@@@@@@")
	console.log(context.payload.pull_request)
	console.log(shouldSkipCoverageCheck)

	const head = context.payload.pull_request.head.ref
	const base = context.payload.pull_request.base.ref

	let changed = []

	const githubClient = getOctokit(token)

	if (showChangedFiles) {
		// Use GitHub's compare two commits API.
		// https://developer.github.com/v3/repos/commits/#compare-two-commits

		const response = await githubClient.rest.repos.compareCommits({
			base,
			head,
			owner: context.repo.owner,
			repo: context.repo.repo,
		})

		if (response.status === 200 && response.data.files.length > 0) {
			response.data.files.forEach((file) => {
				if (file.status === "added" || file.status === "modified") {
					changed.push(file.filename)
				}
			})
		}
	}

	const options = {
		name,
		files: changed,
		repository: context.payload.repository.full_name,
		commit: context.payload.pull_request.head.sha,
		prefix: `${process.env.GITHUB_WORKSPACE}/`,
		minCoverage: minCoverage,
		head,
		base,
		workflowName: process.env.GITHUB_WORKFLOW,
	}

	const lcov = await parse(raw)
	const baselcov = baseRaw && (await parse(baseRaw))

	let error = null

	if (minCoverage > 0) {
		const coverage = percentage(lcov)
		if (coverage < minCoverage) {
			error = new Error(
				`Coverage is below the minimum of ${minCoverage}%. Current coverage is ${coverage}%`,
			)
		}
	}

	let body = await diff(lcov, baselcov, options)

	// Truncate body to max 65536 chars because GitHub API max supports this.
	body = body.slice(0, 65500)

	const createGitHubComment = () =>
		githubClient.rest.issues.createComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			issue_number: context.payload.pull_request.number,
			body,
		})

	const updateGitHubComment = (commentId) =>
		githubClient.rest.issues.updateComment({
			repo: context.repo.repo,
			owner: context.repo.owner,
			comment_id: commentId,
			body,
		})

	if (updateComment) {
		const issueComments = await githubClient.rest.issues.listComments({
			repo: context.repo.repo,
			owner: context.repo.owner,
			issue_number: context.payload.pull_request.number,
		})

		const existingComment = issueComments.data.find((comment) =>
			comment.body.includes(commentIdentifier(options.workflowName)),
		)

		if (existingComment) {
			await updateGitHubComment(existingComment.id)
			if (error) {
				throw error
			}
			return
		}
	}

	await createGitHubComment()

	if (error) {
		throw error
	}
}

export default main().catch(function (err) {
	console.log(err)
	core.setFailed(err.message)
})
