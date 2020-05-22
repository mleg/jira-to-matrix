import { translate } from '../../../locales';
import * as utils from '../../../lib/utils';
import { getAllSettingData, setSettingsData } from '../../settings';

export const autoinvite = async ({ bodyText, roomName, sender, chatApi, config, taskTracker }) => {
    const jiraBotUser = config.jira.user;
    const projectKey = utils.getProjectKeyFromIssueKey(roomName);
    const { lead, issueTypes, admins } = await taskTracker.getProjectWithAdmins(projectKey);

    if (!admins) {
        return translate('jiraBotWereAreNotInProject', { jiraBotUser });
    }

    const allAdmins = await Promise.all(
        [lead, ...admins].map(displayName => chatApi.getUserIdByDisplayName(displayName)),
    );

    if (!allAdmins.some(name => name.includes(sender))) {
        return translate('notAdmin', { sender });
    }
    const namesIssueTypeInProject = issueTypes.map(({ name }) => name);

    const { [projectKey]: currentInvite = {} } = await getAllSettingData('autoinvite');

    // to do
    if (!bodyText) {
        return utils.getIgnoreTips(projectKey, Object.entries(currentInvite), 'autoinvite');
    }
    const [command, typeTaskFromUser, userFromCommand] = bodyText.split(' ');
    const { [typeTaskFromUser]: currentUsers = [] } = currentInvite;

    if (!['add', 'del'].includes(command) || !typeTaskFromUser || !userFromCommand) {
        return translate('invalidCommand');
    }

    if (!namesIssueTypeInProject.includes(typeTaskFromUser)) {
        return utils.ignoreKeysInProject(projectKey, namesIssueTypeInProject);
    }
    // to do
    const matrixUserFromCommand = chatApi.getChatUserId(userFromCommand);
    // TODO rename to isUser
    if (!(await chatApi.getUser(matrixUserFromCommand))) {
        return translate('notInMatrix', { userFromCommand });
    }

    switch (command) {
        case 'add':
            if (currentUsers.includes(userFromCommand)) {
                return translate('keyAlreadyExistForAdd', { typeTaskFromUser: userFromCommand, projectKey });
            }
            await setSettingsData(
                projectKey,
                {
                    ...currentInvite,
                    [typeTaskFromUser]: [...currentUsers, userFromCommand],
                },
                'autoinvite',
            );

            return translate('autoinviteKeyAdded', { projectKey, matrixUserFromCommand, typeTaskFromUser });
        case 'del':
            if (!currentUsers.includes(userFromCommand)) {
                return translate('keyNotFoundForDelete', { projectKey });
            }
            await setSettingsData(
                projectKey,
                {
                    ...currentInvite,
                    [typeTaskFromUser]: currentUsers.filter(task => task !== matrixUserFromCommand),
                },
                'autoinvite',
            );

            return translate('autoinviteKeyDeleted', {
                projectKey,
                matrixUserFromCommand: userFromCommand,
                typeTaskFromUser,
            });
        default:
            return translate('invalidCommand');
    }
};
