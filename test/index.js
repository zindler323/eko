import { Eko }  from '../src/eko.js';

const eko = new Eko();

const workflow = eko.generateWorkflow('');
const result = eko.execute(workflow, {
    callback (node) {
        console.log(node);
    }
});