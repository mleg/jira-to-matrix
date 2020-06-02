import { pipe, set, clone } from 'lodash/fp';
import nock from 'nock';
import { expect } from 'chai';
import commentCreatedHook from '../fixtures/webhooks/comment/created.json';
import issueCommentedHook from '../fixtures/webhooks/issue/updated/commented.json';
import { redis } from '../../src/redis-client';
import notIgnoreIssueBody from '../fixtures/jira-api-requests/issue.json';
import { cleanRedis, taskTracker, getChatClass } from '../test-utils';
import { translate } from '../../src/locales';
import { config } from '../../src/config';
import { HookParser } from '../../src/hook-parser';
import { QueueHandler } from '../../src/queue';
import { Config } from '../../src/types';
import { Actions } from '../../src/bot/actions';

const issueId = commentCreatedHook.comment.self.split('/').reverse()[2];

describe('get-parsed-save to redis', () => {
    const redisKey = `postComment_${commentCreatedHook.timestamp}`;
    const expected = {
        funcName: 'postComment',
        data: {
            issueID: commentCreatedHook.comment.self.split('/').reverse()[2],
            headerText: translate(commentCreatedHook.webhookEvent, {
                name: commentCreatedHook.comment.author.displayName,
            }),
            comment: {
                body: commentCreatedHook.comment.body,
                id: commentCreatedHook.comment.id,
            },
            author: commentCreatedHook.comment.author.displayName,
        },
    };

    const configProdMode: Config = pipe(clone, set('testMode.on', false))(config) as Config;

    const actions = new Actions(configProdMode, taskTracker, getChatClass().chatApi);
    const queueHandler = new QueueHandler(taskTracker, configProdMode, actions);
    const hookParser = new HookParser(taskTracker, configProdMode, queueHandler);

    before(() => {
        nock(taskTracker.getRestUrl())
            .get(`/project/${issueCommentedHook.issue.fields.project.id}`)
            .times(5)
            .reply(200, { isPrivate: false })
            .get(`/issue/${issueId}`)
            .times(2)
            .reply(200, notIgnoreIssueBody);

        nock(config.taskTracker.url)
            .get('')
            .times(2)
            .reply(200, '<HTML>');
    });

    afterEach(async () => {
        await cleanRedis();
    });

    after(() => {
        nock.cleanAll();
    });

    it('isCommentEvent', () => {
        const result1 = taskTracker.selectors.isCommentEvent(commentCreatedHook);
        expect(result1).to.be.true;
        const result2 = taskTracker.selectors.isCommentEvent(issueCommentedHook);
        expect(result2).to.be.equal(false);
    });

    it('Expect comment_created hook to be parsed and save to redis without ignore', async () => {
        await hookParser.getParsedAndSaveToRedis(commentCreatedHook);

        const redisValue = await redis.getAsync(redisKey);
        const result = JSON.parse(redisValue);

        expect(result).to.be.deep.equal(expected);
    });
});
