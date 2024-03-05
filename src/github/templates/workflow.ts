import { Octokit } from '@octokit/rest';

import { StringBuilder } from '@/utils/string-builder';

import { Context, ExtractPayload } from '../types';

import { Template, StopHandleError, TemplateRenderResult } from './components';

const conclusionToAdv = (
  conclusion:
    | 'success'
    | 'failure'
    | 'neutral'
    | 'cancelled'
    | 'timed_out'
    | 'action_required'
    | 'stale'
    | 'skipped',
) => {
  switch (conclusion) {
    case 'success':
      return 'successfully';
    case 'failure':
      return 'failed';
    case 'neutral':
      return 'neutral';
    case 'cancelled':
      return 'cancelled';
    case 'timed_out':
      return 'timed out';
    case 'action_required':
      return 'action required';
    case 'stale':
      return 'stale';
    case 'skipped':
      return 'skipped';
    default:
      return conclusion;
  }
};

function renderWorkflow(
  payload: ExtractPayload<'workflow_run'>,
  ctx: Context & {
    octokit?: Octokit;
  },
): TemplateRenderResult {
  const action = payload.action as string;

  return Template(
    {
      payload,
      event: 'workflow',
      action,
      title: `workflow [{{workflow.name}}]({{workflow_run.html_url}}) ran ${conclusionToAdv(
        payload.workflow_run.conclusion!,
      )}`,
    },
    ctx,
  );
}

export async function handleWorkflowRun(
  payload: ExtractPayload<'workflow_run'>,
  ctx: Context & {
    octokit?: Octokit;
  },
): Promise<TemplateRenderResult> {
  const workflow = payload.workflow;
  const workflowRun = payload.workflow_run;
  const repository = payload.repository;
  if (!workflowRun.path) {
    throw new StopHandleError('need workflow path');
  }

  if (!ctx.octokit) {
    throw new StopHandleError('should have ctx octokit');
  }

  const mapping = ctx.setting.workflowEventToNotify ?? {};
  const repoAllow = mapping[repository.full_name];

  if (repoAllow && repoAllow.includes(workflow.name)) {
    return renderWorkflow(payload, ctx);
  }

  throw new StopHandleError(
    'only selected path allow to run, receive path: ' + workflowRun.path,
  );
}
