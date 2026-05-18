const nlp = require('compromise');
const doc = nlp("John bought 5 shares for $30 in New York on Jan 5th.");
console.log("People:", doc.people().out('array'));
console.log("Places:", doc.places().out('array'));
console.log("Organizations:", doc.organizations().out('array'));
console.log("Money:", typeof doc.money === 'function' ? doc.money().out('array') : doc.match('#Money').out('array'));
console.log("Dates:", typeof doc.dates === 'function' ? doc.dates().out('array') : doc.match('#Date').out('array'));
