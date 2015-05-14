import * as b from './ast-builder';
import * as escodegen from './escodegen-es6';

export let print = console.log;

let _debug = false;

export function setDebug(f) {
    _debug = f;
}

export function debug(msg) {
    if (_debug) console.log(msg);
}

export function unimplemented(msg) {
    print(`unimplemented functionality: ${msg}`);
    throw new Error(msg);
}

export function warn_unimplemented(msg) {
    debug(`unimplemented functionality: ${msg}`);
}

export function error(msg) {
    print(`ERROR: ${msg}`);
    throw new Error(msg);
}


export function dumpStatements(ast, indent = 0) {
    if (!_debug) return;

    if (!ast) return;
    switch(ast.type) {
    case b.Program:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        ast.body.forEach((el) => dumpStatements(el, indent + 2));
        break;
    case b.BlockStatement:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        ast.body.forEach((el) => dumpStatements(el, indent + 2));
        break;
    case b.IfStatement:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        console.log(`${" ".repeat(indent+2)}then:`);
        dumpStatements(ast.consequent, indent + 2);
        console.log(`${" ".repeat(indent+2)}else:`);
        dumpStatements(ast.alternate, indent + 2);
        break;
    case b.WhileStatement:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        dumpStatements(ast.body, indent + 2);
        break;
    case b.TryStatement:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        dumpStatements(ast.block, indent + 2);
        if (ast.handlers.length > 0) {
            console.log(`${" ".repeat(indent+2)}catch:`);
            dumpStatements(ast.handlers[0], indent + 2);
        }
        if (ast.finalizer) {
            console.log(`${" ".repeat(indent+2)}finally:`);
            dumpStatements(ast.finalizer, indent + 2);
        }
        break;
    case b.CatchClause:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        dumpStatements(ast.body, indent + 1);
        break;
    case b.ExpressionStatement:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type} ${escodegen.generate(ast._ast)}`);
        break;
    default:
        console.log(`${" ".repeat(indent)}${ast.astid}: ${ast.type}`);
        break;
    }
}
