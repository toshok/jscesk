/* -*- Mode: js2; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */

import * as esprima from   './esprima-es6';
import * as b from         './ast-builder';
import * as fs from        '@node-compat/fs';

import { dumpStatements, unimplemented, error, setDebug } from './utils';
import { assignNext, wrap, CESKDone } from './ast';
import { State } from './state';
import { Store } from './store';
import { Environment } from './env';
import { HaltKont } from './kont';
import { resetPointers } from './pointer';

import { initES6Env } from './es6';

// CESK = (C)ode, (E)nvironment, (S)tore, and K(C)ontinuation
//
// Code        : just our AST, helpfully converted to ANF, and with a _nextStmt for each statement
// Environment : a stack of frames, mapping from name to address
// Store       : a global store mapping from address to type(s)
// Kontinuation: a stack used to match return statements to the call, as well as throw statements to handlers.
//

    
// we don't do this at the moment, so take care when crafting tests
function toANF(ast) {
    return ast;
}

function execute(toplevel) {
    resetPointers();

    // create an initial store (this also initializes the store's NullPointer)
    let store0 = new Store();

    // allocate an initial frame pointer
    let fp0 = new Environment();

    initES6Env(fp0, store0);

    // get the Halt continuation
    let halt = new HaltKont();

    // create our initial state
    let state = new State(toplevel, fp0, store0, halt);

    // Run until termination:
    while (!state.stmt.done) {
        state = state.next();
    }
}

function runcesk(name, program_text) {
    var test = esprima.parse(program_text);
    var cesktest = wrap(test);
    assignNext(cesktest, new CESKDone());
    cesktest = toANF(cesktest);
    dumpStatements(cesktest);
    let timer = `runcesk ${name}`;
    console.time(timer);
    execute(cesktest);
    console.timeEnd(timer);
}

let args = process.argv.slice();
args.shift(); // get rid of argv0

if (args.length > 0 && args[0] == '-d') {
    args.shift(); // get rid of -d
    setDebug(true);
}
    
if (args.length === 0)
    error("must specify test to run on command line, ex: ./jscesk.exe tests/func-call.js");

let test_file = args[0];
let test_contents = fs.readFileSync(test_file, 'utf-8');

runcesk(test_file, test_contents);
