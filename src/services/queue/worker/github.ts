import { EmitterWebhookEventName, Webhooks } from '@octokit/webhooks';
import { chunk, groupBy, orderBy } from 'es-toolkit';
import DefaultMap from 'mnemonist/default-map';

import { GitHubDAO } from '@/dal/github';
import { ISetting } from '@/dal/types';
import { initApp } from '@/services/github/app';
import { setupWebhooksTemplate } from '@/services/github/handler';
import { TemplateRenderResult } from '@/services/github/templates';
import { Logger } from '@/utils/logger';

import { IGitHubEventQueueMessage } from '../types';

import { DingtalkService } from '@/services/dingtalk';
import { BaseWorker } from '.';

export function createUniqueMessageId(
  data: {
    repository: {
      full_name: string;
    };
    pull_request?: {
      number: number;
    };
    discussion?: {
      number: number;
    };
    sender: {
      login: string;
    };
  },
  prefix = '',
) {
  return `${prefix}#${data?.repository?.full_name}#${data?.pull_request?.number}#${data?.discussion?.number}#${data?.sender?.login}`;
}

export interface IOctokitShape {
  webhooks: Webhooks<any>;
  setting: ISetting;
}

export class GitHubEventWorker extends BaseWorker<IGitHubEventQueueMessage> {
  logger = Logger.instance();

  constructor(public type: 'app' | 'webhook') {
    super();
  }

  onBatchDoneForTest(_results: IResult[]) {
    // do nothing
  }

  private _appMap = new Map<string, IOctokitShape>();
  async createGitHubApp(botId: string): Promise<IOctokitShape | undefined> {
    const cached = this._appMap.get(botId);
    if (cached) {
      return cached;
    }

    const appSetting = await GitHubDAO.instance().getAppSettingById(botId);

    if (!appSetting) {
      this.logger.error('github app worker error: setting not found', botId);
      return;
    }

    if (!appSetting.githubSecret) {
      this.logger.error(
        'github app worker error: please set app webhook secret in database',
        botId,
      );
      return;
    }

    const app = await initApp(appSetting);
    this._appMap.set(botId, {
      webhooks: app.webhooks,
      setting: appSetting,
    });
    return {
      webhooks: app.webhooks,
      setting: appSetting,
    };
  }

  private _webhookMap = new Map<string, IOctokitShape>();
  async createWebhook(botId: string): Promise<IOctokitShape | undefined> {
    const cached = this._webhookMap.get(botId);
    if (cached) {
      return cached;
    }
    const _setting = await GitHubDAO.instance().getSettingById(botId);
    if (!_setting) {
      this.logger.error('github app worker error: setting not found', botId);
      return;
    }

    if (!_setting.githubSecret) {
      this.logger.error(
        'github app worker error: please set webhook secret in database',
        botId,
      );
      return;
    }

    const webhooks = new Webhooks<{
      octokit: undefined;
    }>({
      secret: _setting.githubSecret,
    });
    const setting = _setting;

    this._webhookMap.set(botId, {
      webhooks,
      setting,
    });
    return {
      webhooks,
      setting,
    };
  }

  async run() {
    const byId = groupBy(
      orderBy(this.queue, ['timestamp'], ['asc']),
      (v) => v.body.botId,
    );

    const result = await Promise.allSettled(
      Object.entries(byId).map(async ([botId, messages]) => {
        this.logger.info('consume for', botId, messages.length);

        let octokit: IOctokitShape | undefined;

        if (this.type === 'app') {
          octokit = await this.createGitHubApp(botId);
        } else if (this.type === 'webhook') {
          octokit = await this.createWebhook(botId);
        } else {
          this.logger.error('github app worker error: unknown type', this.type);
          return;
        }

        if (!octokit) {
          this.logger.error('cannot get octokit info for ', botId);
          return;
        }

        const results = [] as IResult[];
        const multiViewResults = new DefaultMap<string, EventComposite>(
          (key) => new EventComposite(key),
        );

        const { webhooks, setting } = octokit;

        setupWebhooksTemplate(
          webhooks,
          { setting, queueMode: true },
          async ({ markdown, name, eventName, payload }) => {
            const result = { eventName, markdown };
            switch (name) {
              case 'pull_request_review': {
                const key = createUniqueMessageId(payload, 'pr_review');
                multiViewResults.get(key).setMainView(result);
                break;
              }
              case 'pull_request_review_comment': {
                const key = createUniqueMessageId(payload, 'pr_review');
                multiViewResults.get(key).addSubView(result);
                break;
              }
              case 'discussion': {
                const key = createUniqueMessageId(payload, 'discussion');
                multiViewResults.get(key).setMainView(result);
                break;
              }
              case 'discussion_comment': {
                const key = createUniqueMessageId(payload, 'discussion');
                multiViewResults.get(key).addSubView(result);
                break;
              }
              default: {
                results.push(result);
                break;
              }
            }
          },
        );

        await Promise.allSettled(
          messages.map(async (message) => {
            try {
              await webhooks.receive(message.body.data);
              message.ack();
            } catch (error) {
              console.error('github app worker error', error);
              message.retry({
                delaySeconds: 1,
              });
            }
          }),
        );

        multiViewResults.forEach((v) => {
          results.push(...v.toResult());
        });

        this.onBatchDoneForTest(results);

        for (const { markdown, eventName } of results) {
          try {
            await DingtalkService.instance().sendToDing(
              markdown,
              eventName as EmitterWebhookEventName,
              setting,
            );
          } catch (error) {
            console.error('github app worker error', error);
          }
        }
      }),
    );

    result.forEach((v) => {
      if (v.status === 'rejected') {
        console.error('github app worker error', v);
      }
    });
  }
}

class EventComposite {
  mainView!: IResult;
  subView: IResult[] = [];

  constructor(public key: string) {}

  setMainView(data: IResult) {
    this.mainView = data;
  }

  addSubView(data: IResult) {
    this.subView.push(data);
  }

  toResult() {
    const { mainView, subView } = this;

    const chunkSize = 10;

    const result = [] as IResult[];

    const separator = '\n\n***\n\n';

    function constructView(mainView: IResult, subViews: IResult[]) {
      const title = mainView.markdown.title;
      const eventName = mainView.eventName;
      let text = subViews
        .map((d) => d.markdown.compactText || d.markdown.text)
        .join(separator);

      text = mainView.markdown.text + separator + text;

      result.push({
        eventName,
        markdown: {
          title,
          text,
        },
      });
    }

    if (mainView) {
      if (subView.length > 0) {
        chunk(subView, chunkSize).forEach((subViews) => {
          constructView(mainView, subViews);
        });
      } else {
        result.push(mainView);
      }
    } else if (subView.length > 0) {
      // only have subView
      if (subView.length === 1) {
        result.push(subView[0]);
      } else {
        chunk(subView, chunkSize).forEach((subViews) => {
          const mainView = subViews.shift() as IResult;
          constructView(mainView, subViews);
        });
      }
    }

    return result;
  }
}

interface IResult {
  eventName: string;
  markdown: TemplateRenderResult;
}
