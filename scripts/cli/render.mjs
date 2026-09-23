import {execFileSync} from 'node:child_process';
execFileSync('npx', ['remotion','render','src/index.tsx','PaperUI','final.mp4','--codec','h264','--crf','18'], {stdio:'inherit'});
