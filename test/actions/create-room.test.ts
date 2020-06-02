import { pipe, set, clone } from 'lodash/fp';
import nock from 'nock';
import { CreateRoom } from '../../src/bot/actions/create-room';
import { config } from '../../src/config';
import * as chai from 'chai';
import sinonChai from 'sinon-chai';
import { getChatClass, taskTracker, getUserIdByDisplayName } from '../test-utils';

import commentCreatedJSON from '../fixtures/webhooks/comment/created.json';
import renderedIssueJSON from '../fixtures/jira-api-requests/issue-rendered.json';
import epicJSON from '../fixtures/webhooks/epic/created.json';
import projectJSON from '../fixtures/webhooks/project/created.json';
import issueCreatedHook from '../fixtures/webhooks/issue/created.json';
import watchersBody from '../fixtures/jira-api-requests/watchers.json';
import projectData from '../fixtures/jira-api-requests/project.json';
import issueBodyJSON from '../fixtures/jira-api-requests/issue.json';
import { Jira } from '../../src/task-trackers/jira';
import { CreateRoomData } from '../../src/types';
import { getDefaultErrorLog } from '../../src/lib/utils';

const { expect } = chai;
chai.use(sinonChai);

describe('Create room test', () => {
    let chatApi;
    let options: CreateRoomData;
    let createRoom: CreateRoom;

    const notFoundUserIssueKey = 'KEY';
    const notFoundUser = 'not_found_user';
    const issueWithIncorrectCreator = pipe(
        clone,
        set('fields.creator.displayName', notFoundUser),
        set('key', notFoundUserIssueKey),
    )(issueBodyJSON);

    const members = [
        getUserIdByDisplayName(issueBodyJSON.fields.reporter.displayName),
        getUserIdByDisplayName(issueBodyJSON.fields.creator.displayName),
        getUserIdByDisplayName(issueBodyJSON.fields.assignee.displayName),
    ].map(name => getChatClass().chatApiSingle.getChatUserId(name));

    // colors INDEV-749
    const [projectForAvatar] = config.colors.projects;
    const issueKeyAvatar = `${projectForAvatar}-123`;

    const watchers = watchersBody.watchers
        .map(({ displayName }) => displayName !== 'jira_bot' && displayName)
        .filter(Boolean)
        .map(getUserIdByDisplayName)
        .map(getChatClass().chatApiSingle.getChatUserId);
    const errorMsg = 'some error';

    const createRoomData = taskTracker.parser.getCreateRoomData(issueCreatedHook);

    const projectKey = epicJSON.issue.fields.project.key;

    const expectedEpicRoomOptions = {
        room_alias_name: epicJSON.issue.key,
        invite: [...new Set([...members, ...watchers])],
        name: getChatClass().chatApiSingle.composeRoomName(epicJSON.issue.key, epicJSON.issue.fields.summary),
        topic: taskTracker.getViewUrl(epicJSON.issue.key),
        purpose: taskTracker.selectors.getSummary(epicJSON),
        avatarUrl: undefined,
    };

    const expectedIssueRoomOptions = {
        room_alias_name: createRoomData.issue.key,
        invite: [...new Set([...members, ...watchers])],
        name: getChatClass().chatApiSingle.composeRoomName(createRoomData.issue.key, createRoomData.issue.summary),
        topic: taskTracker.getViewUrl(createRoomData.issue.key),
        purpose: createRoomData.issue.summary,
        avatarUrl: undefined,
    };

    const expectedIssueRoomOptionsNoSummary = {
        room_alias_name: issueBodyJSON.key,
        invite: [...new Set([...members, ...watchers])],
        name: getChatClass().chatApiSingle.composeRoomName(issueBodyJSON.key, issueBodyJSON.fields.summary),
        topic: taskTracker.getViewUrl(issueBodyJSON.key),
        purpose: issueBodyJSON.fields.summary,
        avatarUrl: undefined,
    };

    const expectedIssueAvatar = {
        room_alias_name: issueKeyAvatar,
        invite: [...new Set([...members, ...watchers])],
        name: getChatClass().chatApiSingle.composeRoomName(issueKeyAvatar, issueBodyJSON.fields.summary),
        topic: taskTracker.getViewUrl(issueKeyAvatar),
        purpose: issueBodyJSON.fields.summary,
        avatarUrl: config.colors.links.issue,
    };

    const expectedEpicProjectOptions = {
        room_alias_name: projectKey,
        invite: [getChatClass().chatApiSingle.getChatUserId(getUserIdByDisplayName(projectData.lead.displayName))],
        name: getChatClass().chatApiSingle.composeRoomName(projectData.key, projectData.name),
        topic: taskTracker.getViewUrl(projectKey),
    };

    const expectedCreateProjectOptions = {
        room_alias_name: projectJSON.project.key,
        invite: [getChatClass().chatApiSingle.getChatUserId(getUserIdByDisplayName(projectData.lead.displayName))],
        name: getChatClass().chatApiSingle.composeRoomName(projectData.key, projectData.name),
        topic: taskTracker.getViewUrl(projectJSON.project.key),
    };

    beforeEach(() => {
        const chatClass = getChatClass({
            alias: [createRoomData.issue.key, createRoomData.projectKey!],
            roomId: [createRoomData.issue.key, createRoomData.projectKey!],
        });
        chatApi = chatClass.chatApiSingle;
        createRoom = new CreateRoom(config, taskTracker, chatApi);

        nock(taskTracker.getRestUrl())
            // comment created hook
            .get(`/issue/${taskTracker.selectors.getIssueId(commentCreatedJSON)}`)
            .times(2)
            .reply(200, issueBodyJSON)
            .get(`/issue/${issueBodyJSON.key}`)
            .reply(200, issueBodyJSON)
            .get(`/issue/${notFoundUserIssueKey}`)
            .times(4)
            .reply(200, issueWithIncorrectCreator as any)
            .get(`/issue/${notFoundUserIssueKey}/watchers`)
            .reply(200, watchersBody)
            .get(`/issue/${notFoundUserIssueKey}`)
            .query(Jira.expandParams)
            .reply(200, renderedIssueJSON)
            .get(`/issue/${createRoomData.issue.key}`)
            .times(3)
            .reply(200, issueBodyJSON)
            .get(`/issue/${issueBodyJSON.key}/watchers`)
            .reply(200, watchersBody)
            .get(`/issue/${issueBodyJSON.key}`)
            .query(Jira.expandParams)
            .reply(200, renderedIssueJSON)
            // room created hook
            .get(`/issue/${createRoomData.issue.key}/watchers`)
            .reply(200, watchersBody)
            // avatar
            .get(`/issue/${issueKeyAvatar}`)
            .times(3)
            .reply(200, { ...issueBodyJSON, key: issueKeyAvatar })
            .get(`/issue/${issueKeyAvatar}/watchers`)
            .reply(200, watchersBody)
            .get(`/issue/${issueKeyAvatar}`)
            .query(Jira.expandParams)
            .reply(200, renderedIssueJSON)
            .get(`/issue/${epicJSON.issue.key}/watchers`)
            .reply(200, watchersBody)
            .get(`/project/${projectKey}`)
            .reply(200, projectData)
            .get(`/project/${issueCreatedHook.issue.fields.project.key}`)
            .reply(200, projectData)
            .get(`/project/${projectJSON.project.key}`)
            .reply(200, projectData)
            .get(`/issue/${createRoomData.issue.key}`)
            .query(Jira.expandParams)
            .reply(200, renderedIssueJSON)
            .get(`/issue/${epicJSON.issue.key}`)
            .times(2)
            .reply(200, issueBodyJSON)
            .get(`/issue/${epicJSON.issue.key}`)
            .query(Jira.expandParams)
            .reply(200, renderedIssueJSON);
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('Expect both issue room and project room not to be created if we run simple issue_created and both chat room exists in chat', async () => {
        const result = await createRoom.run(createRoomData);
        expect(result).to.be.true;
        expect(chatApi.createRoom).not.to.be.called;
    });

    it("Expect room should be created if it's not exists and project creates if we run simple issue_created", async () => {
        chatApi.getRoomIdByName.reset();
        chatApi.getRoomIdByName.resolves(false);
        const result = await createRoom.run(createRoomData);
        expect(chatApi.createRoom).to.be.calledWithExactly(expectedIssueRoomOptions);
        expect(result).to.be.true;
    });

    it('Expect project and epic rooms should be created if Epic body we get and no rooms exists', async () => {
        chatApi.getRoomId.throws();
        const result = await createRoom.run(taskTracker.parser.getCreateRoomData(epicJSON));
        expect(chatApi.createRoom).to.be.calledWithExactly(expectedEpicRoomOptions);
        expect(chatApi.createRoom).to.be.calledWithExactly(expectedEpicProjectOptions);
        expect(result).to.be.true;
    });

    it('Expect project should be created if project_created hook we get and no project room exists', async () => {
        chatApi.getRoomId.throws();
        const result = await createRoom.run(taskTracker.parser.getCreateRoomData(projectJSON));
        expect(chatApi.createRoom).to.be.calledOnceWithExactly(expectedCreateProjectOptions);
        expect(result).to.be.true;
    });

    it('Expect error in room create throws error', async () => {
        chatApi.createRoom.throws(errorMsg);
        let res;
        const expectedError = [getDefaultErrorLog('create room'), getDefaultErrorLog('createIssueRoom'), errorMsg].join(
            '\n',
        );

        try {
            res = await createRoom.run(taskTracker.parser.getCreateRoomData(epicJSON));
        } catch (err) {
            res = err;
        }
        expect(res).to.be.deep.equal(expectedError);
    });

    it('Expect error in room createRoomProject throw error', async () => {
        chatApi.createRoom.throws(errorMsg);
        let res;
        const expectedError = [
            getDefaultErrorLog('create room'),
            getDefaultErrorLog('createProjectRoom'),
            errorMsg,
        ].join('\n');

        try {
            chatApi.getRoomId.callsFake(id => !(id === projectKey));

            const result = await createRoom.run({ ...options, ...createRoomData, projectKey });
            expect(result).not.to.be;
        } catch (err) {
            res = err;
        }
        expect(res).to.be.deep.equal(expectedError);
    });

    it('Expect room not creates if issue not exists', async () => {
        nock.cleanAll();
        const result = await createRoom.run({
            ...taskTracker.parser.getCreateRoomData(commentCreatedJSON),
        });

        expect(chatApi.createRoom).not.to.be.called;
        expect(result).to.be.false;
    });

    it('Expect room created if we get create_comment hook', async () => {
        chatApi.getRoomId.throws();
        const result = await createRoom.run({
            ...taskTracker.parser.getCreateRoomData(commentCreatedJSON),
        });

        expect(chatApi.createRoom).to.be.calledWithExactly({
            room_alias_name: issueBodyJSON.key,
            // beacause watchers are includes issue assigne in this case
            invite: [...new Set([...members, ...watchers])],
            name: getChatClass().chatApiSingle.composeRoomName(issueBodyJSON.key, issueBodyJSON.fields.summary),
            topic: taskTracker.getViewUrl(issueBodyJSON.key),
            purpose: issueBodyJSON.fields.summary,
            avatarUrl: undefined,
        });
        expect(result).to.be.true;
    });

    it("Expect room should be created if it's not exists and project creates if we run create room with only key", async () => {
        chatApi.getRoomIdByName.reset();
        chatApi.getRoomIdByName.resolves(false);
        const result = await createRoom.run({
            issue: {
                key: createRoomData.issue.key,
                projectKey: createRoomData.projectKey,
                descriptionFields: { typeName: createRoomData.issue.descriptionFields!.typeName } as any,
            },
        });
        expect(chatApi.createRoom).to.be.calledWithExactly(expectedIssueRoomOptionsNoSummary);
        expect(result).to.be.true;
    });

    it("Expect room should be created if it's not exists with avatar url if no project is in the config list colors", async () => {
        chatApi.getRoomIdByName.reset();
        chatApi.getRoomIdByName.resolves(false);
        const result = await createRoom.run({
            ...options,
            issue: {
                key: issueKeyAvatar,
                projectKey: projectForAvatar,
                descriptionFields: { typeName: 'Task' } as any,
            },
        });

        expect(chatApi.createRoom).to.be.calledWithExactly(expectedIssueAvatar);
        expect(result).to.be.true;
    });
    it('Expect room should be created if descriptionFields not exist in roomdata', async () => {
        chatApi.getRoomIdByName.reset();
        chatApi.getRoomIdByName.resolves(false);
        const result = await createRoom.run({
            issue: { key: issueKeyAvatar, projectKey: projectForAvatar },
        });

        expect(chatApi.createRoom).to.be.calledWithExactly(expectedIssueAvatar);
        expect(result).to.be.true;
    });

    it('Expect create room not invite user without chat id', async () => {
        const result = await createRoom.run({ ...options, issue: { key: notFoundUserIssueKey } });

        expect(result).to.be.true;
        expect(chatApi.createRoom).to.be.called;
    });
});

// describe('Create room test with gitlab as task tracker', () => {
//     let gitlabTracker: Gitlab;
//     const gitlabConfig: Config = {
//         ...config,
//         taskTracker: {
//             type: 'gitlab',
//             url: 'https://gitlab.test-example.ru',
//             user: 'gitlab_bot',
//             password: 'fakepasswprd',
//         },
//     };

//     beforeEach(() => {
//         gitlabTracker = new Gitlab(gitlabConfig);
//     });

//     describe('Issue room is already exists', () => {});

//     describe('Issue room is NOT exists', () => {});

//     it("should create room if it's not exists", async () => {});
// });
