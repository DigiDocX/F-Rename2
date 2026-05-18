const nlp = require('compromise');
const doc = nlp("John");
console.log('people:', typeof doc.people, 'places:', typeof doc.places, 'orgs:', typeof doc.organizations);
