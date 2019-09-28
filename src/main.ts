import { ChecksUpdateParamsOutput, ChecksUpdateParamsOutputAnnotations } from '@octokit/rest'
import exec from './exec'
import { createCheck, updateCheck } from './check'
import { Conclusion, AnnotationLevel } from '../@types/check'

const { INPUT_TARGET } = process.env

const checkName = 'Docker Lint Check'

interface ParsedLintResult {
  conclusion: Conclusion,
  output: ChecksUpdateParamsOutput
}

interface LintResults {
  totalIssues: string
  files: LintResultsFile[]
}

interface LintResultsFile {
  file: string
  issues: LintResultFileIssue[]
}

interface LintResultFileIssue {
  line: string,
  category: string
  title: string
  content: string
}

const dockerLint = async () : Promise<ParsedLintResult> => {
  const { stdout } = await exec(`dockerfilelint ${INPUT_TARGET} -j`)
  const result : LintResults = JSON.parse(stdout)
  const { files, totalIssues } = result

  const levels : AnnotationLevel[] = ['notice', 'warning', 'failure']

  const annotations: ChecksUpdateParamsOutputAnnotations[] = []
  files.forEach((file) => {
    const { issues } = file
    const path = file.file
    issues.forEach((issue) => {
      const {
        line, category, title, content,
      } = issue
      const annotationLevel = levels[2]
      annotations.push({
        path,
        start_line: parseInt(line, 10),
        end_line: parseInt(line, 10),
        start_column: 0,
        end_column: content.length - 1,
        annotation_level: annotationLevel,
        message: `[${category}] ${title}`,
      })
    })
  })

  return {
    conclusion: parseInt(totalIssues, 10) > 0 ? 'failure' : 'success',
    output: {
      title: checkName,
      summary: `${totalIssues} issue(s) found`,
      annotations,
    },
  }
}

function exitWithError(err : any) {
  console.error('Error', err.stack)
  if (err.data) {
    console.error(err.data)
  }
  process.exit(1)
}

async function run() {
  const id = await createCheck()
  try {
    const { conclusion, output } = await dockerLint()
    console.log(output.summary)
    await updateCheck(id, conclusion, output)
    if (conclusion === 'failure') {
      process.exit(78)
    }
  } catch (err) {
    await updateCheck(id, 'failure')
    exitWithError(err)
  }
}

run().catch(exitWithError)