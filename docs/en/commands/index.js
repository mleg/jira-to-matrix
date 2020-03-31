const fs = require('fs');
const path = require('path');

const comment = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'comment.md'), 'utf8');
const assign = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'assign.md'), 'utf8');
const move = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'move.md'), 'utf8');
const spec = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'spec.md'), 'utf8');
const prio = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'prio.md'), 'utf8');
const op = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'op.md'), 'utf8');
const invite = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'invite.md'), 'utf8');
const ignore = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'ignore.md'), 'utf8');
const create = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'create.md'), 'utf8');
const autoinvite = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'autoinvite.md'), 'utf8');
const alive = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'alive.md'), 'utf8');
const getInfo = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'getInfo.md'), 'utf8');
const archive = fs.readFileSync(path.resolve('.', 'docs', 'en', 'commands', 'archive.md'), 'utf8');

module.exports = {
    comment,
    assign,
    move,
    spec,
    prio,
    op,
    invite,
    ignore,
    create,
    autoinvite,
    alive,
    getInfo,
    archive,
};
