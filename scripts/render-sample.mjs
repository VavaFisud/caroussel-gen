import { generateForAllAccounts, sampleCarousel } from '../src/generator.js';

const result = await generateForAllAccounts(sampleCarousel);
console.log(JSON.stringify(result, null, 2));
