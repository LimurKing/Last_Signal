import {readdir,readFile} from 'node:fs/promises';import {validateCards,cards} from '../src/cardDatabase.js';
validateCards();for(const [key,min] of Object.entries({professions:24,personalities:20,skills:20,baggage:24,secrets:20,disasters:16,roles:4}))if(cards[key].length<min)throw Error(`В категории ${key} недостаточно карт`);
const files=['server.js','public/index.html','public/style.css','public/js/home.js','tests/gameEngine.test.js'];for(const f of files)await readFile(new URL(`../${f}`,import.meta.url));
console.log('Структура и база карт проверены.');
