import { Client, ClientOptions, Collection } from 'discord.js';

import config from '../config';

import { ApplicationCommandExecutor, PrefixCommandExecutor } from '@/types/command';
import { JukeboxClientUtils } from '@/utils/client';
import { ComponentExecutor } from '@/types/component';

export class JukeboxClient extends Client {
    readonly applicationCommands = new Collection<string, ApplicationCommandExecutor>();
    readonly prefixCommands = new Collection<string, PrefixCommandExecutor>();

    readonly components = new Collection<string, ComponentExecutor>();

    readonly config = config;
    readonly utils = new JukeboxClientUtils(this);

    private static instance: JukeboxClient | undefined;

    constructor(options: ClientOptions) {
        super(options);
        JukeboxClient.instance = this;
    }

    login() {
        return super.login(this.config.bot_token);
    }

    static getInstance() {
        return this.instance!;
    }
}
