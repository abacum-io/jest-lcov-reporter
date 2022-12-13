// @ts-check
import { th, tr, td, table, tbody, a, b, span, fragment } from "./html"

// Tabulate the lcov data in a HTML table.
export function tabulate(lcov, options) {
	const head = tr(
		th("File"),
		// th("Branches"),
		th("Lines (%)"),
		th("Funcs (%)"),
		th("Uncovered Lines"),
	)

	const folders = {}

	function getFileParts(fileName) {
		return fileName.replace(options.prefix, "").split("/");
	}

	function getFolderName(parts = []) {
		return parts.slice(0, -1).join("/");
	}
	
	options.files.forEach((fileName) => {
		const parts = getFileParts(fileName);
		const folder = getFolderName(parts);
		folders[folder] = [];
	});

	for (const file of lcov) {
		const shouldIncludeFile = options.files.length === 0 || options.files.includes(file.file)
		const parts = getFileParts(file.file);
		const folder = getFolderName(parts);
		const hasFolder = folder in folders;

		if (!shouldIncludeFile && !hasFolder) {
			continue
		}
		
		folders[folder] = folders[folder] || []
		folders[folder].push(file)
	}

	const rows = Object.keys(folders)
		.sort()
		.reduce(
			(acc, key) => {
				const files = folders[key].sort((a,b)=>a.file.localeCompare(b.file)).map(file => toRow(file, key !== "", options)).filter(e => e !== null);
				return files.length ? [
					...acc,
					toFolder(key),
					...files
					,
				] : [...acc];
			},
			[],
		)

	return table(tbody(head, ...rows))
}

function smartTrim(rawPath) {
	const path = rawPath.replace('src/', '');
	const parts = path.split("/");
	const keywords = ['components'];
	const newParts = parts.map((p)=>{
		return keywords.includes(p) ? '...' : p.split('.').pop();
	});
	const newLine = newParts.join('/');
	if (newLine.length <= 96) {
		return newLine;
	} else {
		return `${newLine.slice(0, 96)}...`;
	}
}


function toFolder(path) {
	if (path === "") {
		return ""
	}

	return tr(td({ colspan: 4 }, `<b title="${path}">${smartTrim(path)}</b>`))
}

function toRow(file, indent, options) {
	let branches = percentage(file.branches, options.minCoverage);
	let functions = percentage(file.functions, options.minCoverage);
	let lines = percentage(file.lines, options.minCoverage);
	let lineCoverage = file.lines ? numericPercentage(file.lines) : 0;

	const allOk = branches === '' && functions === '' && lines === '';

	if (allOk) {
		return null;
	}

	let name = filename(file, indent, options);

	if (lineCoverage > 0 && lineCoverage < options.minCoverage) {
		name = `🔴${indent?'':'&nbsp;'}${name}&nbsp;⬆️&nbsp;${(options.minCoverage - lineCoverage).toFixed(2)}%`;
	}

	return tr(
		td(name),
		// td(branches),
		td(lines),
		td(functions),
		td(uncovered(file, options)),
	)
}

function filename(file, indent, options) {
	const relative = file.file.replace(options.prefix, "")
	const parts = relative.split("/")
	const last = parts[parts.length - 1]
	const space = indent ? "&nbsp; &nbsp;" : ""
	return fragment(space, last)
}

function numericPercentage(item) {
	return item.found === 0 ? 100 : (item.hit / item.found) * 100;
}

function percentage(item, minCoverage = 0) {
	if (!item) {
		return "N/A"
	}

	const value = numericPercentage(item);
	const rounded = value.toFixed(2).replace(/\.0*$/, "")

	const tag = value > minCoverage ? fragment : b


	if (rounded === '100') {
		return "";
	}

	if (rounded === '0') {
		return "0";
	}

	return tag(`${rounded}`)
}

function uncovered(file, options) {
	const branches = (file.branches ? file.branches.details : [])
		.filter(branch => branch.taken === 0)
		.map(branch => branch.line)

	const lines = (file.lines ? file.lines.details : [])
		.filter(line => line.hit === 0)
		.map(line => line.line)
	const allLines = [...branches, ...lines]
	let all = [...branches, ...lines].sort()
	if (all.length > 3) {
		const lastFour = all.slice(Math.max(all.length - 4, 0))

		all = [...lastFour, '...']
	}
	return all
		.map(function(line) {
			const relative = file.file.replace(options.prefix, "")
			const path = `${line}`
			return path;
		})
		.join(", ")
}
