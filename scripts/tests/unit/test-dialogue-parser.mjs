import assert from 'node:assert/strict';
import {parseDialogue, normalizePlainText} from '../../lib/dialogue-parser.mjs';
import {compileTimeline, typingFramesFor, revealFramesFor} from '../../lib/timeline-compiler.mjs';

const zh = `用户：\n你好\n\nAI：\n**可以。** 这是测试。\n\n用户：第二个问题\nAI：第二个回答`;
const msgs = parseDialogue(zh);
assert.equal(msgs.length, 4);
assert.equal(msgs[0].speaker, 'user');
assert.equal(msgs[1].speaker, 'assistant');
assert.equal(msgs[1].text, '可以。 这是测试。');
assert.equal(msgs[2].text, '第二个问题');

const en = `User: What can this do?\nAssistant: It makes a Paper UI video.`;
assert.equal(parseDialogue(en).length, 2);

const custom = parseDialogue(`Eian: Hello\nAstra: Hi`, {userLabels:['Eian'], assistantLabels:['Astra'], userName:'Eian', assistantName:'Astra'});
assert.deepEqual(custom.map((m) => [m.speaker,m.name]), [['user','Eian'],['assistant','Astra']]);

assert.equal(normalizePlainText('## Title\n- **hello**'), 'Title\nhello');
assert.ok(typingFramesFor('short') >= 12 && typingFramesFor('short') <= 24);
assert.ok(revealFramesFor('A fairly long assistant reply that should reveal quickly.') >= 12);

const timeline = compileTimeline(msgs, {taskText:'Parser test'});
assert.equal(timeline.fps, 24);
assert.equal(timeline.holdFrames, 24);
assert.equal(timeline.messages[0].startFrame, 0);
assert.ok(timeline.messages[1].typingFrames >= 12 && timeline.messages[1].typingFrames <= 24);
assert.ok(timeline.messages[1].revealStartFrame > timeline.messages[1].typingStartFrame);
assert.equal(timeline.meta.messageCount, 4);
console.log('dialogue parser + timeline compiler tests passed');
