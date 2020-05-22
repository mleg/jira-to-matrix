import * as http from 'http';
import StateMachine from 'javascript-state-machine';
import StateMachineHistory from 'javascript-state-machine/lib/history';
import { states } from './states';
import { ChatFasade } from '../messengers/chat-fasade';
import { timing } from '../lib/utils';
import { getLogger } from '../modules/log';
import { TaskTracker, MessengerApi } from '../types';

const logger = getLogger(module);

const getJiraFsm = (app, port) =>
    new StateMachine({
        init: states.init,
        transitions: [
            { name: 'start', from: states.init, to: states.ready },
            { name: 'hookResponsed', from: '*', to: states.hookResponsed },
            { name: 'handlingInProgress', from: [states.hookResponsed, states.ready], to: states.startHandling },
            { name: 'finishHandle', from: '*', to: states.ready },
            { name: 'stop', from: '*', to: states.init },
        ],
        data: {
            server: null,
        },
        methods: {
            onStart() {
                this.server = http.createServer(app);
                this.server.listen(port, () => {
                    logger.info(`Jira hooks are listening on port ${port}`);
                });
            },
            // onEnterState() {
            //     logger.debug('Now jira fsm state is "%s"', this.state);
            // },
            onStop() {
                logger.info('Jira server close');
                return this.is('init') || this.server.close();
            },
            // onPendingTransition(transition, from, to) {
            //     logger.error('FSM error', transition, from, to);
            // },
        },
    });

/**
 * @returns {StateMachine} state machine
 */
const getChatFsm = (chatFasade: ChatFasade, handler): StateMachine => {
    const startTime = Date.now();
    const fsm = new StateMachine({
        init: states.init,
        transitions: [
            { name: 'connect', from: states.init, to: states.startConnection },
            { name: 'finishConnection', from: states.startConnection, to: states.ready },
            { name: 'handleQueue', from: states.ready, to: states.startHandling },
            { name: 'finishHandle', from: states.startHandling, to: states.ready },
            { name: 'stop', from: '*', to: states.init },
        ],
        methods: {
            async onConnect() {
                const bots = chatFasade.getAllInstance();
                await Promise.all(
                    bots.map(async item => {
                        await item.connect();
                        // const message = await item.connect();

                        const botId = item.getMyId();
                        const { min, sec } = timing(startTime);
                        const message = `Matrix bot "${botId}" was connected on: ${min} min ${sec} sec`;

                        await chatFasade.sendNotify(message);
                        await chatFasade.joinBotToInfoRoom(botId);
                    }),
                );
            },
            async onFinishConnection() {
                const { min, sec } = timing(startTime);
                const message = `All matrix bots were connected on ${min} min ${sec} sec`;

                await chatFasade.sendNotify(message);
                // const bots = chatFasade.getAllInstance();
                // await Promise.all(
                //     bots.map(async item => {
                //         const botId = item.getMyId();
                //         await chatFasade.joinBotToInfoRoom(botId);
                //     }),
                // );
            },
            async onHandleQueue() {
                logger.debug('Start queue handling');
                await handler(chatFasade);
            },
            onFinishHandle() {
                logger.debug('Finish queue handling');
            },
            // onEnterState() {
            //     logger.debug('Now matrix fsm state is "%s"', this.state);
            // },
            onStop() {
                logger.info('Messenger disconnected');
                return this.is('init') || chatFasade.disconnect();
            },
            // onPendingTransition(transition, from, to) {
            //     logger.error('FSM error', transition, from, to);
            // },
        },
        plugins: [new StateMachineHistory({ max: 10 })],
    });

    return fsm;
};

export class FSM {
    taskTracker: TaskTracker;
    chatFSM;
    jiraFsm;

    // eslint-disable-next-line valid-jsdoc
    /**
     * @param {import('../messengers/messenger-abstract')[]} chatApi array of instances of messenger Api, matrix or slack for example
     * @param {Function} queueHandler redis queue handle function
     * @param {Function} app jira express REST app
     * @param {import('../task-trackers/jira')} taskTracker task tracker instance
     * @param {number} port jira server port
     */
    constructor(chatApiPool: MessengerApi[], queueHandler: Function, getServer: Function, taskTracker, port) {
        const chatFasade = new ChatFasade(chatApiPool);
        this.taskTracker = taskTracker;
        this.chatFSM = getChatFsm(chatFasade, queueHandler);
        this.jiraFsm = getJiraFsm(getServer(taskTracker, this.handleHook.bind(this)), port);
    }

    /**
     * Handling Jira hook
     */
    async handleHook() {
        this.jiraFsm.hookResponsed();
        await this._handle();
    }

    /**
     * Handling redis data
     */
    async _handle() {
        if (this.chatFSM.can('handleQueue')) {
            this.jiraFsm.handlingInProgress();
            await this.chatFSM.handleQueue();
            this.chatFSM.finishHandle();

            this.jiraFsm.is('hookResponsed') && (await this._handle());
        }
    }

    /**
     * Start service with matrix connection and first handling redis data
     */
    async start() {
        this.jiraFsm.start();
        await this.chatFSM.connect();
        await this.chatFSM.finishConnection();
        this.jiraFsm.handlingInProgress();
        await this.chatFSM.handleQueue();
        this.chatFSM.finishHandle();

        this.jiraFsm.is('hookResponsed') ? await this._handle() : this.jiraFsm.finishHandle();
    }

    /**
     * Test only
     *
     * @param {string} [fsmName='chatFSM'] fsmName
     * @returns {Array} fsm states history
     */
    history(fsmName = 'chatFSM') {
        return this[fsmName].history;
    }

    /**
     * Test only
     *
     * @param {string} [fsmName='chatFSM'] fsmName
     * @returns {string} fsm current state
     */
    state(fsmName = 'chatFSM') {
        return this[fsmName].state;
    }

    /**
     * Stop all
     */
    stop() {
        this.jiraFsm.stop();
        this.chatFSM.stop();
    }
}
