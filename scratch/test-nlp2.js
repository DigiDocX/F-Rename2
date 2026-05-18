const nlp = require('compromise');
const doc = nlp("Jan 5th");
console.log(typeof doc.dates);
