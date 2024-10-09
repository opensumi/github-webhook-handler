import { StopErrorWithReply } from '@opensumi/bot-commander';

import { IBotAdapter } from '../types';

import { Session } from '@opensumi/dingtalk-bot';
import { Context } from './types';

export function hasApp(
  item: Context,
): item is Context & Required<Pick<Context, 'app'>> {
  return !!item.app;
}

export async function replyIfAppNotDefined(_bot: IBotAdapter, ctx: Context) {
  if (!hasApp(ctx)) {
    throw new StopErrorWithReply(
      'current bot has not configured use GitHub App. Please contact admin.',
    );
  }
}

export async function getGitHubUserFromDingtalkId(
  bot: IBotAdapter,
  session: Session,
) {
  const dingtalkId = session.msg.senderId;
  const githubId =
    await bot.userInfoKVManager.getGitHubUserByDingtalkId(dingtalkId);
  if (!githubId) {
    throw new StopErrorWithReply(
      'it seem that you have not bind GitHub account, use `bind-github username` command to bind your GitHub account. e.g. `bind-github bytemain',
    );
  }

  return githubId;
}
