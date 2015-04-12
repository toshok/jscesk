/* -*- Mode: js2; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */

import * as esprima from 'esprima-es6';
import * as escodegen from 'escodegen-es6';
import * as b from 'ast-builder';

let print = console.log;
function debug(msg) {
    //console.log(msg);
}

// CESK = (C)ode, (E)nvironment, (S)tore, and K(C)ontinuation
//
// Code        : just our AST, helpfully converted to ANF, and with a _nextStmt for each statement
// Environment : a stack of frames, mapping from name to address
// Store       : a global store mapping from address to type(s)
// Kontinuation: a stack used to match return statements to the call, as well as throw statements to handlers.
//

function unimplemented(msg) {
    debug(`unimplemented functionality: ${msg}`);
    throw new Error(msg);
}

function error(msg) {
    debug(`ERROR: ${msg}`);
    throw new Error(msg);
}

// JS spec functions

// 7.1.1
function ToPrimitive(val, PreferredType) {
    if (val.value === undefined)   { return val; }
    else if (val.value === null)   { return val; }
    else if (val instanceof CBool) { return val; }
    else if (val instanceof CNum)  { return val; }
    else if (val instanceof CStr)  { return val; }
    return unimplemented("ToPrimitive");
}

// 7.1.2
function ToBoolean(val) {
    if (val instanceof CBool) { return val; }
    else if (val.value === undefined) { return CBool.False; }
    else if (val.value === null) { return CBool.False; }
    else if (val instanceof CNum) { return (isNaN(val.value) || val.value === 0) ? CBool.True : CBool.False; }
    else if (val instanceof CStr) { return val.value === "" ? CBool.True : CBool.False; }
    else
        // XXX Symbol and Object bool convert to true
        return CBool.True;
    return unimplemented("ToBoolean");
}


// 7.1.3
function ToNumber(val) {
    if (val.value === undefined) { return new CNum(NaN); }
    else if (val.value === null) { return new CNum(0); }
    else if (val instanceof CBool) { return new CNum(val.value ? 1 : 0); }
    else if (val instanceof CNum) { return val; }

    return unimplemented("missing ToNumber() support");
}

// 7.2.11
function AbstractRelationalComparison(x, y, leftFirst) {
    let px, py;
    // 3. If the LeftFirst flag is true, then
    if (leftFirst) {
        px = ToPrimitive(x);
        py = ToPrimitive(y);
    }
    else {
        py = ToPrimitive(y);
        px = ToPrimitive(x);
    }
    if (px instanceof CStr && py instanceof CStr) {
        // itself, because r may be the empty String.)
        if (px.value.startsWith(py.value)) return CBool.False;
        
        // b. If px is a prefix of py, return true.
        if (py.value.startsWith(px.value)) return CBool.True;
        // c. Let k be the smallest nonnegative integer such that the code unit at index k within px is different from the code unit at index k within py. (There must be such a k, for neither String is a prefix of the other.)
        // d. Let m be the integer that is the code unit value at index k within px.
        // e. Let n be the integer that is the code unit value at index k within py.
        // f. If m < n, return true. Otherwise, return false.
        return unimplemented("string relation");
    }
    // 6. Else,
    else {
        // a. Let nx be ToNumber(px). Because px and py are primitive values evaluation order is not important.
        // c. Let ny be ToNumber(py).
        let nx = ToNumber(px);
        let ny = ToNumber(py);


        // e. If nx is NaN, return undefined.
        if (isNaN(nx.value)) return new CVal(undefined);
        // f. If ny is NaN, return undefined.
        if (isNaN(ny.value)) return new CVal(undefined);

        // g. If nx and ny are the same Number value, return false.
        if (nx.value === ny.value) return CBool.False;

        // h. If nx is +0 and ny is 0, return false.
        if (nx.value === +0 && ny === -0) return CBool.False;

        // i. If nx is 0 and ny is +0, return false.
        if (nx.value === -0 && ny === +0) return CBool.False;

        // j. If nx is +, return false.
        if (nx.value === +Infinity) return CBool.False;

        // k. If ny is +, return true.
        if (ny.value === +Infinity) return CBool.True;

        // l. If ny is , return false.
        if (ny.value === -Infinity) return CBool.False;
        // m. If nx is , return true.
        if (nx.value === -Infinity) return CBool.True;

        // n. If the mathematical value of nx is less than the mathematical value of ny —note that these mathematical values are both finite and not both zero—return true. Otherwise, return false.
        return (nx.value < ny.value) ? CBool.True : CBool.False;
    }
}

// pointers (and frame pointers, which form our Environment), along with our Store
let maxPointer = 0;
class Pointer {
    constructor() {
        this.value = ++maxPointer;
    }
    toString() { return `Pointer(${this.value})`; }
}

class FramePointer extends Pointer {
    constructor() {
        this._offset = 0;
        this._offsets = Object.create(null);
    }
    
    push() { return new FramePointer(); }

    offset(name) {
        if (name in this._offsets)
            return this._offsets[name];
        let rv = new Pointer();
        this._offsets[name] = rv;
        return rv;
        /*
        this._offsets[name] = this._offset++;
        return this._offset - 1;
         */
    }
        toString() { return `FramePointer(${this.value})`; }
}

class Store {
    constructor() {
        this._store = Object.create(null);
    }

    get(addr) {
        return this._store[addr.value] || new CVal(undefined);
    }
    
    set(addr, val) {
        if (addr.value in this._store)
            this._store[addr.value] = val;
        else
            unimplemented("set() of addr not in store");
    }

    static extend(store, addr, val) {
        let rv = new Store();
        for (let k of Object.getOwnPropertyNames(store._store)) {
            rv._store[k] = store._store[k];
        }
        rv._store[addr.value] = val;
        return rv;
    }
    
    toString() {
        let rv = "Store(\n";
        for (let k of Object.getOwnPropertyNames(this._store)) {
            rv += `  ${k} -> ${this._store[k]}\n`;
        }
        rv += ")";
        return rv;
    }
}

// concrete values

class CVal {
    constructor(val) {
        this._val = val;
    }
    get value() { return this._val; }
    toString() { return `CVal(${this.value})`; }
}

class CBool extends CVal {
    constructor(val) {
        super(val);
    }

    static get False() { return new CBool(false); }
    static get True() { return new CBool(true); }
    toString() { return `CBool(${this.value})`; }
}

class CNum extends CVal {
    constructor(num) { super(num); }
    toString() { return `CNum(${this.value})`; }
}

class CStr extends CVal {
    constructor(str) { super(str); }
    toString() { return `CStr(${this.value})`; }
}

class CBuiltinFunc extends CVal {
    constructor(arity, fun) {
        super(fun);
        this._arity = arity;
    }
    toString() { return `CBuiltinFunc(${this._arity}, ${this.value})`; }
}
    

// continuations

class Kont {
    constructor(next) {
        this._next = next;
    }
    get next() { return this._next; }
}

class AssignKont extends Kont {
    constructor(name, stmt, fp, kont) {
        super(kont);
        this._name = name;
        this._stmt = stmt;
        this._fp = fp;
    }
    get stmt() { return this._stmt; }
    get fp() { return this._fp; }

    apply(returnValue, store) {
        let store_;
        if (this._name)
            store_ = Store.extend(store, this._fp.offset(this._name), returnValue);
        else
            store_ = store;
        return new State(this._stmt, this._fp, store_, this.next);
    }
}

class HaltKont extends Kont {
    constructor() { super(null); }
    apply(returnValue, store) {
        unimplemented("HaltKont.apply");
    }
}

// the state type that wraps up Stmt x Environment x Store x Kont
class State {
    constructor(stmt, fp, store, kont) {
        if (!stmt || !stmt.type) error("State.stmt must be an ast node");
        this.stmt = stmt;
        this.fp = fp;
        this.store = store;
        this.kont = kont;
    }
    next() {
        debug(`State.next called, current stmt = ${this.stmt.type}`);
        return this.stmt.step(this.fp, this.store, this.kont);
    }

    toString() { return `State(${this.stmt.type})`; }
}

// ast wrapper nodes so we can associate methods with ast types
class CESKAst {
    constructor(astnode) { this._ast = astnode; }
    get type() { return this._ast.type; }
    get nextStmt() { return this._nextStmt; }
}

class CESKStatement extends CESKAst {
    constructor(astnode) { super(astnode); }
}

class CESKExpression extends CESKAst {
    constructor(astnode) { super(astnode); }
}

class CESKFunctionDeclaration extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._body = wrap(astnode.body);
        // params
        // name
    }
    get body() { return this._body; }
    get name() { return this._ast.id.name; }
    
    step(fp, store, kont) {
        debug(`CESKFunctionDeclaration(${this.name}).step`);
        debug(`  offset = ${fp.offset(this.name)}`);
        // a function declaration extends the local environment with a
        // mapping from the function's name to the function.
        let store_ = Store.extend(store, fp.offset(this.name), this);
        debug (`after extend, store is ${store_.toString()}`);
        return new State(this.nextStmt, fp, store_, kont);
    }
    toString() { return `CESKFunctionDeclaration(${this.name}, ${escodegen.generate(this._ast.body)})`; }
}

class CESKReturn extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._argument = wrap(astnode.argument);
    }
    get body() { return this._body; }

    step(fp, store, kont) {
        debug("CESKReturn.step");

        let returnValue = this._argument.eval(fp, store);
        return kont.apply(returnValue, store);
    }
}

class CESKProgram extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._body = astnode.body.map(wrap);
    }
    get body() { return this._body; }

    step(fp, store, kont) {
        debug("CESKProgram.step");
        // easy - we just skip to the first statement inside the program
        return new State(this.nextStmt, fp, store, kont);
    }
}

class CESKBlockStatement extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._body = astnode.body.map(wrap);
    }
    get body() { return this._body; }

    step(fp, store, kont) {
        debug("CESKBlockStatement.step");
        // easy - we just skip to the first statement inside the block
        // (or the first one afterward if the block is empty)
        return new State(this.nextStmt, fp, store, kont);
    }
}

function callFunc(callee, args, name, nextStmt, fp, store, kont) {
    let callee_ = callee.eval(fp, store, kont);
    if (callee_ instanceof CBuiltinFunc) {
        let js_args = args.map((arg) => {
            return arg.eval(fp, store, kont).value;
        });
        let kont_ = new AssignKont(name, nextStmt, fp, kont);
        return kont_.apply(callee_.value.apply(undefined, js_args), store);
    }
    // pretty bad check for "is this a function?", but it'll do for now
    else if (!callee_.body) {
        debug(callee_.toString());
        return error("callee is not a function");
    }
    else {
        let kont_ = new AssignKont(name, nextStmt, fp, kont);
        return new State(callee_.body, fp, store, kont_);
    }
}
    
class CESKVariableDeclaration extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._declarations = astnode.declarations.map(wrap);
    }
    get declarations() { return this._declarations; }
    get kind() { return this._ast.kind; }

    step(fp, store, kont) {
        debug("CESKVariableDeclaration.step");
        // our ANF pass has flattened declarations to a single declarator

        let name = this.declarations[0].name;
        let init = this.declarations[0].init;
        if (init && init.type === b.CallExpression) {
            // XXX should assert that init.callee is an identifier
            debug(` store is ${store.toString()}`);
            debug(` callee.name is ${init.callee.name}`);
            debug(` fp.offset(callee.name) is ${fp.offset(init.callee.name).toString()}`);
            return callFunc(init.callee, init.arguments, name, this.nextStmt, fp, store, kont);
        }
        else {
            let store_ = store;
            for (let decl of this.declarations) {
                let val = decl.init.eval(fp, store, kont);
                debug(val.toString());
                store_ = Store.extend(store_, fp.offset(decl.name), val);
            }
            return new State(this.nextStmt, fp, store_, kont);
        }
    }
}

class CESKVariableDeclarator extends CESKAst {
    constructor(astnode) {
        super(astnode);
        this._id = wrap(astnode.id);
        this._init = wrap(astnode.init);
    }
    get name() { return this._id.name; }
    get id() { return this._id; }
    get init() { return this._init; }
}

class CESKIdentifier extends CESKExpression {
    constructor(astnode) {
        super(astnode);
    }
    get name() { return this._ast.name; }
    eval(fp, store, kont) {
        debug(`CESKIdentifier.eval(${this._ast.name})`);
        debug(` offset = ${fp.offset(this._ast.name)}`);
        return store.get(fp.offset(this._ast.name));
    }
}

class CESKBinaryExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._left = wrap(astnode.left);
        this._right = wrap(astnode.right);
    }
    get operator() { return this._ast.operator; }
    get left() { return this._left; }
    get right() { return this._right; }
    eval(fp, store, kont) {
        debug("CESKBinaryExpression.eval");
        let lval = this._left.eval(fp, store, kont);
        let rval = this._right.eval(fp, store, kont);
        switch (this.operator) {
            case '+': return new CNum(lval.value + rval.value);
            case '<': { 
                let r = AbstractRelationalComparison(lval, rval, true);
                if (r.value === undefined)
                    return CBool.False;
                return r;
            }
            case '>': { 
                let r = AbstractRelationalComparison(lval, rval, false);
                if (r.value === undefined)
                    return CBool.False;
                return r;
            }
            case '<=': { 
                let r = AbstractRelationalComparison(lval, rval, false);
                if (r.value === undefined || r.value === true)
                    return CBool.False;
                return CBool.True;
            }
            case '>=': { 
                let r = AbstractRelationalComparison(lval, rval, true);
                if (r.value === undefined || r.value === true)
                    return CBool.False;
                return CBool.True;
            }
            default: return unimplemented(`unrecognized binary operation: ${this.operator}`);
        }
        
    }
}

class CESKLogicalExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._left = wrap(astnode.left);
        this._right = wrap(astnode.right);
    }
    get operator() { return this._ast.operator; }
    get left() { return this._left; }
    get right() { return this._right; }
    eval(fp, store, kont) {
        debug("CESKBinaryExpression.eval");
        let lval = ToBoolean(this._left.eval(fp, store, kont));
        let rval = ToBoolean(this._right.eval(fp, store, kont));
        switch (this.operator) {
            default: return unimplemented(`unrecognized logical operation: ${this.operator}`);
        }
    }
}

class CESKAssignmentExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._left = wrap(astnode.left);
        this._right = wrap(astnode.right);
    }
    get op() { return this._ast.op; }
    get left() { return this._left; }
    get right() { return this._right; }
    eval(fp, store, kont) {
        debug("CESKAssignmentExpression.eval");
        //let lval = this._left.eval(fp, store, kont);
        let rval = this._right.eval(fp, store, kont);

        if (this._left.type === b.Identifier) {
            store.set(fp.offset(this._left.name), rval);
        }
        else {
            return unimplemented("unrecognized lhs");
        }
        
        return rval;
    }
}

class CESKExpressionStatement extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._expression = wrap(astnode.expression);
    }
    get expression() { return this._expression; }
    step(fp, store, kont) {
        debug("CESKExpressionStatement.step");
        let val = this._expression.eval(fp, store, kont);
        if (val instanceof State)
            return val;
        return new State(this.nextStmt, fp, store, kont);
    }
}

class CESKLiteral extends CESKExpression {
    constructor(astnode) {
        super(astnode);
    }
    get value() { return this._ast.value; }
    get raw() { return this._ast.raw; }

    eval(fp, store, kont) {
        debug("CESKLiteral.eval");
        if (typeof(this._ast.value) === "number")
            return new CNum(this._ast.value);
        else if (typeof(this._ast.value) === "string")
            return new CStr(this._ast.value);
        else if (typeof(this._ast.value) === "boolean")
            return new CBool(this._ast.value);
        return unimplemented("CESKLiteral.eval");
    }
    toString() { return `CESKLiteral(${this.value})`; }
}

class CESKCallExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._callee = wrap(astnode.callee);
        this._arguments = astnode.arguments.map(wrap);
    }
    get callee() { return this._callee; }
    get arguments() { return this._arguments; }
    eval(fp, store, kont) {
        debug("CESKCallExpression.eval");
        // ANF should have ensured that this would be a simple identifier lookup, not a complex expression, and cannot throw.

        // XXX eval arguments
        return callFunc(this._callee, this._arguments, undefined, this.nextStmt, fp, store, kont);
    }
}

class CESKIf extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._test = wrap(astnode.test);
        this._consequent = wrap(astnode.consequent);
        if (astnode.alternate)
            this._alternate = wrap(astnode.alternate);
    }
    get test() { return this._test; }
    get consequent() { return this._consequent; }
    get alternate() { return this._alternate; }
    step(fp, store, kont) {
        let testValue = ToBoolean(this._test.eval(fp, store));
        if (testValue.value) {
            return new State(this._consequent, fp, store, kont);
        }
        else if (this._alternate) {
            return new State(this._alternate, fp, store, kont);
        }
        else {
            return new State(this._nextStmt, fp, store, kont);
        }
    }
}

class CESKWhile extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._test = wrap(astnode.test);
        this._body = wrap(astnode.body);
    }
    get test() { return this._test; }
    get body() { return this._body; }
    step(fp, store, kont) {
        debug(`CESKWhile()`);
        let testValue = ToBoolean(this._test.eval(fp, store));
        if (testValue.value) {
            return new State(this._body, fp, store, kont);
        }
        else {
            return new State(this._nextStmt, fp, store, kont);
        }
    }
}

class CESKEmpty extends CESKStatement {
    constructor(astnode) {
        super(astnode);
    }
    step(fp, store, kont) {
        return new State(this.nextStmt, fp, store, kont);
    }
}

class CESKDone extends CESKStatement {
    constructor() {
        super({ type: "Done" });
        this.done = true;
    }
    step(fp, store, kont) {
        error("shouldn't reach here");
    }
}

function wrap(astnode) {
    switch(astnode.type) {
    case b.ArrayExpression: return unimplemented('ArrayExpression');
    case b.ArrayPattern: return unimplemented('ArrayPattern');
    case b.ArrowFunctionExpression: return unimplemented('ArrowFunctionExpression');
    case b.AssignmentExpression: return new CESKAssignmentExpression(astnode);
    case b.BinaryExpression: return new CESKBinaryExpression(astnode);
    case b.BlockStatement: return new CESKBlockStatement(astnode);
    case b.BreakStatement: return unimplemented('BreakStatement');
    case b.CallExpression: return new CESKCallExpression(astnode);
    case b.CatchClause: return unimplemented('CatchClause');
    case b.ClassBody: return unimplemented('ClassBody');
    case b.ClassDeclaration: return unimplemented('ClassDeclaration');
    case b.ClassExpression: return unimplemented('ClassExpression');
    case b.ClassHeritage: return unimplemented('ClassHeritage');
    case b.ComprehensionBlock: return unimplemented('ComprehensionBlock');
    case b.ComprehensionExpression: return unimplemented('ComprehensionExpression');
    case b.ComputedPropertyKey: return unimplemented('ComputedPropertyKey');
    case b.ConditionalExpression: return unimplemented('ConditionalExpression');
    case b.ContinueStatement: return unimplemented('ContinueStatement');
    case b.DebuggerStatement: return unimplemented('DebuggerStatement');
    case b.DoWhileStatement: return unimplemented('DoWhileStatement');
    case b.EmptyStatement: return new CESKEmpty(astnode);
    case b.ExportDeclaration: return unimplemented('ExportDeclaration');
    case b.ExportBatchSpecifier: return unimplemented('ExportBatchSpecifier');
    case b.ExportSpecifier: return unimplemented('ExportSpecifier');
    case b.ExpressionStatement: return new CESKExpressionStatement(astnode);
    case b.ForInStatement: return unimplemented('ForInStatement');
    case b.ForOfStatement: return unimplemented('ForOfStatement');
    case b.ForStatement: return unimplemented('ForStatement');
    case b.FunctionDeclaration: return new CESKFunctionDeclaration(astnode);
    case b.FunctionExpression: return unimplemented('FunctionExpression');
    case b.Identifier: return new CESKIdentifier(astnode);
    case b.IfStatement: return new CESKIf(astnode);
    case b.ImportDeclaration: return unimplemented('ImportDeclaration');
    case b.ImportSpecifier: return unimplemented('ImportSpecifier');
    case b.LabeledStatement: return unimplemented('LabeledStatement');
    case b.Literal: return new CESKLiteral(astnode);
    case b.LogicalExpression: return new CESKLogicalExpression(astnode);
    case b.MemberExpression: return unimplemented('MemberExpression');
    case b.MethodDefinition: return unimplemented('MethodDefinition');
    case b.ModuleDeclaration: return unimplemented('ModuleDeclaration');
    case b.NewExpression: return unimplemented('NewExpression');
    case b.ObjectExpression: return unimplemented('ObjectExpression');
    case b.ObjectPattern: return unimplemented('ObjectPattern');
    case b.Program: return new CESKProgram(astnode);
    case b.Property: return unimplemented('Property');
    case b.ReturnStatement: return new CESKReturn(astnode);
    case b.SequenceExpression: return unimplemented('SequenceExpression');
    case b.SpreadElement: return unimplemented('SpreadElement');
    case b.SwitchCase: return unimplemented('SwitchCase');
    case b.SwitchStatement: return unimplemented('SwitchStatement');
    case b.TaggedTemplateExpression: return unimplemented('TaggedTemplateExpression');
    case b.TemplateElement: return unimplemented('TemplateElement');
    case b.TemplateLiteral: return unimplemented('TemplateLiteral');
    case b.ThisExpression: return unimplemented('ThisExpression');
    case b.ThrowStatement: return unimplemented('ThrowStatement');
    case b.TryStatement: return unimplemented('TryStatement');
    case b.UnaryExpression: return unimplemented('UnaryExpression');
    case b.UpdateExpression: return unimplemented('UpdateExpression');
    case b.VariableDeclaration: return new CESKVariableDeclaration(astnode);
    case b.VariableDeclarator: return new CESKVariableDeclarator(astnode);
    case b.WhileStatement: return new CESKWhile(astnode);
    case b.WithStatement: return unimplemented('WithStatement');
    case b.YieldExpression: return unimplemented('YieldExpression');
    default: return unimplemented(astnode.type);
    }
}

// we don't do this at the moment, so take care when crafting tests
function toANF(ast) {
    return ast;
}

// adds a link from each statement to the next one (or null if there isn't one)
function assignNext(stmt, next) {
    if (stmt.type === b.BlockStatement || stmt.type == b.Program) {
        if (stmt.body.length > 0) {
            for (let i = stmt.body.length - 1; i >= 0; i--) {
                assignNext(stmt.body[i], next);
                next = stmt.body[i];
            }
            stmt._nextStmt = stmt.body[0];
        }
        else
            stmt._nextStmt = next;
    }
    else if (stmt.type === b.IfStatement) {
        assignNext(stmt.alternate, next);
        assignNext(stmt.consequent, next);
        stmt._nextStmt = next;
    }
    else if (stmt.type === b.WhileStatement) {
        assignNext(stmt.body, stmt);
        stmt._nextStmt = next;
    }
    else if (stmt.type === b.FunctionDeclaration) {
        assignNext(stmt.body, null);
        stmt._nextStmt = next;
    }
    else if (stmt.type === b.ReturnStatement) {
        stmt._nextStmt = null;
    }
    else if (stmt.type === b.ThrowStatement) {
        stmt._nextStmt = null;
    }
    else if (stmt.type === b.BreakStatement) {
        unimplemented("we don't handle break/continue yet");
    }
    else if (stmt.type === b.ContinueStatement) {
        unimplemented("we don't handle break/continue yet");
    }
    else {
        stmt._nextStmt = next;
    }
}


function execute(toplevel) {
    // allocate an initial frame pointer
    let fp0 = new FramePointer();

    // create an initial store
    let store0 = new Store();

    store0 = Store.extend(store0, fp0.offset("print"), new CBuiltinFunc(1, function print(x) { console.log(x); }));

    // get the Halt continuation
    let halt = new HaltKont();

    // create our initial state
    let state = new State(toplevel, fp0, store0, halt);

    // Run until termination:
    while (!state.stmt.done) {
        state = state.next();
    }
}


function runcesk(program_text) {
    var test = esprima.parse(program_text);
    var cesktest = wrap(test);
    assignNext(cesktest, new CESKDone());
    cesktest = toANF(cesktest);
    debug(cesktest.type);
    execute(cesktest);
}

runcesk("function toplevel() { let x = 5 + 6; return x; } let y = toplevel(); let unused = print(y);");
runcesk("function toplevel() { let x = 5 + 6; return x; } let y = toplevel(); if (y < 10) { let unused = print(y); } else { let unused = print(10); }");
runcesk("function toplevel() { let x = 5 + 6; return x; } let y = toplevel(); let z = 0; while (z < y) { let unused = print(z); z = z + 1; }");
