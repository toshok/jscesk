/* -*- Mode: js2; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */

import * as esprima from   './esprima-es6';
import * as escodegen from './escodegen-es6';
import * as b from         './ast-builder';
import * as fs from        '@node-compat/fs';

let print = console.log;
let _debug = false;
function debug(msg) {
    if (_debug) console.log(msg);
}

function unimplemented(msg) {
    print(`unimplemented functionality: ${msg}`);
    throw new Error(msg);
}

function warn_unimplemented(msg) {
    debug(`unimplemented functionality: ${msg}`);
}

function error(msg) {
    print(`ERROR: ${msg}`);
    throw new Error(msg);
}


// CESK = (C)ode, (E)nvironment, (S)tore, and K(C)ontinuation
//
// Code        : just our AST, helpfully converted to ANF, and with a _nextStmt for each statement
// Environment : a stack of frames, mapping from name to address
// Store       : a global store mapping from address to type(s)
// Kontinuation: a stack used to match return statements to the call, as well as throw statements to handlers.
//

// concrete values

class CVal {
    constructor(val) {
        this._val = val;
    }
    get value() { return this._val; }
    toString() { return `CVal(${this.value})`; }
}

let _cbool_false;
let _cbool_true;

class CBool extends CVal {
    constructor(val) {
        super(val);
    }

    static get False() { return _cbool_false; }
    static get True() { return _cbool_true; }
    toString() { return `CBool(${this.value})`; }
}

_cbool_false = new CBool(false);
_cbool_true = new CBool(true);

class CObject extends CVal {
    constructor(proto_addr, store) {
        let proto = GetValue(proto_addr, store);
        super(Object.create(null));
        this._proto = proto_addr;
        this._env = new Environment(proto.value ? proto.value._env : null);
        this._env.setOffset("__proto__", proto_addr);
    }
    get proto() { return this._proto; }
    set(key, value, store) {
        if (value instanceof Pointer) {
            this._env.setOffset(key.value, value);
        }
        else {
            warn_unimplemented(`CObject.set(${key.toString()},${value.toString()})`);
        }
    }
    get(key, store) {
        // we assume that key is a CVal subclass here
        let off = this._env.getOffset(key.value, false);
        if (off !== -1) return off;

        // the object didn't have that property, so we add it to the local env
        return this._env.offset(key.value);
    }
    toString() { return `CObject`; }
}

class CArray extends CObject {
    constructor(val) {
        super(val);
    }
    toString() { return `CArray`; }
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
    


// JS spec functions

function GetValue(arg, store) {
    if (arg instanceof Pointer) {
        return store.get(arg);
    }
    return arg;
}

function PutValue(ref, val, store) {
    if (ref instanceof Pointer) {
        store._extend(ref, val);
        return;
    }

    error ("PutValue passed non-ref first arg");
}

// 7.1.1
function ToPrimitive(val, PreferredType) {
    if (val.value === undefined)   { return val; }
    else if (val.value === null)   { return val; }
    else if (val instanceof CBool) { return val; }
    else if (val instanceof CNum)  { return val; }
    else if (val instanceof CStr)  { return val; }
    return unimplemented(`ToPrimitive ${val.toString()}`);
}

// 7.1.2
function ToBoolean(val) {
    if (val instanceof CBool) { return val; }
    else if (val.value === undefined) { return CBool.False; }
    else if (val.value === null) { return CBool.False; }
    else if (val instanceof CNum) { return (isNaN(val.value) || val.value === 0) ? CBool.True : CBool.False; }
    else if (val instanceof CStr) { return val.value === "" ? CBool.True : CBool.False; }
    else if (val instanceof CObject) return CBool.True;
    else
        // XXX Symbol converts to true
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

// 7.2.12
function AbstractEqualityComparison(x, y) {
    // 3. If Type(x) is the same as Type(y), then
    // a. Return the result of performing Strict Equality Comparison x === y.
    // 4. If x is null and y is undefined, return true.
    // 5. If x is undefined and y is null, return true.
    // 6. If Type(x) is Number and Type(y) is String, return the result of the comparison x == ToNumber(y).
    // 7. If Type(x) is String and Type(y) is Number, return the result of the comparison ToNumber(x) == y.
    // 8. If Type(x) is Boolean, return the result of the comparison ToNumber(x) == y.
    // 9. If Type(y) is Boolean, return the result of the comparison x == ToNumber(y).
    // 10. If Type(x) is either String, Number, or Symbol and Type(y) is Object, then return the result of the comparison x == ToPrimitive(y).
    // 11. If Type(x) is Object and Type(y) is either String, Number, or Symbol, then return the result of the comparison ToPrimitive(x) == y.
    // 12. Return false.
    return CBool.False;
}

// 7.2.13
function StrictEqualityComparison(x, y) {
    debug(`comparing ${x.toString()} with ${y.toString()}`);
    // 1. If Type(x) is different from Type(y), return false.
    // 2. If Type(x) is Undefined, return true.
    if (x.value === undefined) return CBool.True;
    // 3. If Type(x) is Null, return true.
    if (x.value === null) return CBool.True;
    // 4. If Type(x) is Number, then
    if (x instanceof CNum) {
        // a. If x is NaN, return false.
        if (isNaN(x.value)) return CBool.False;
        // b. If y is NaN, return false.
        if (isNaN(y.value)) return CBool.False;
        // c. If x is the same Number value as y, return true.
        if (x.value === y.value) return CBool.True;
        // d. If x is +0 and y is 0, return true.
        if (x.value === +0 && y.value === -0) return CBool.True;
        // e. If x is 0 and y is +0, return true.
        if (x.value === -0 && y.value === +0) return CBool.True;
        // f. Return false.
        return CBool.False;
    }
    // 5. If Type(x) is String, then
    if (x instanceof CStr) {
        // a. If x and y are exactly the same sequence of code units (same length and same code units at corresponding indices), return true.
        if (x.value === y.value) return CBool.True;
        // b. Else, return false.
        return CBool.False;
    }
    // 6. If Type(x) is Boolean, then
    if (x instanceof CBool) {
        // a. If x and y are both true or both false, return true.
        if (x.value === y.value) return CBool.True;
        // b. Else, return false.
        return CBool.False;
    }
    return unimplemented("StrictEq not finished");
    // 7. If x and y are the same Symbol value, return true.
    // 8. If x and y are the same Object value, return true.
    // 9. Return false.
    return CBool.False;
}

// pointers (and frame pointers, which form our Environment), along with our Store
let maxPointer = 0;
function Pointer() {
    this.value = ++maxPointer;
}
Pointer.prototype.toString = function() {
    return `Pointer(${this.value})`;
};

class Environment {
    constructor(parent = null) {
        this._parent = parent;
        this._offset = 0;
        this._offsets = Object.create(null);
    }
    
    push() { return new Environment(this); }

    getOffset(name, throwIfNotFound=true) {
        for (let fr = this; fr != null; fr = fr._parent)
            if (name in fr._offsets)
                return fr._offsets[name];
        if (throwIfNotFound)
            return error(`could not find ${name}`);
        return -1;
    }

    setOffset(name, addr) {
        this._offsets[name] = addr;
    }

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
    toString() { return `Environment(${this.value})`; }
}

class Store {
    constructor() {
        this._store = Object.create(null);
    }

    get(addr) {
        if (addr.value === 0)
            return new CVal(null);
        return this._store[addr.value] || new CVal(undefined);
    }
    
    set(addr, val) {
        if (addr.value === 0)
            error("can't set NullPointer's value");
        if (addr.value in this._store)
            this._store[addr.value] = val;
        else
            unimplemented("set() of addr not in store");
    }

    // in-place extend, used to populate the initial environment, and
    // probably shouldn't be used anywhere else.
    _extend(addr, val) {
        this._store[addr.value] = val;
    }

    static clone(store) {
        let rv = new Store();
        for (let k of Object.getOwnPropertyNames(store._store)) {
            rv._store[k] = store._store[k];
        }
        return rv;
    }

    static extend(store, addr, val) {
        let rv = Store.clone(store);
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

    static get NullPointer() { return Object.create(Pointer.prototype, { value: { writable: false, configurable: false, value: 0 } }); }
}

// continuations

class Kont {
    constructor(next) {
        this._next = next;
    }
    get next() { return this._next; }

    // used by HandlerKont + throw
    handle(thrown, store) {
        return this.next.handle(thrown, store);
    }
    // used by AssignKont + return
    apply(returnValue, store) {
        return this.next.apply(returnValue, store);
    }
    // used by LeaveScopeKont + falling off a lexical scope
    leaveScope(store) {
        return this.next.leaveScope(store);
    }
    // used by LeaveHandlerKont + falling off a the end of a try block
    leaveHandler(store) {
        return this.next.leaveHandler(store);
    }
}

// this continuation is matched with 'return' statements inside called
// functions.  function calls register this continuation before
// returning the State corresponding to the function's body, and when
// the function returns, it apply's the current kont.  This bubbles up
// the stack until we find the topmost AssignKont.
class AssignKont extends Kont {
    constructor(name, stmt, fp, kont) {
        super(kont);
        this._name = name;
        this._stmt = stmt;
        this._fp = fp;
    }
    get stmt() { return this._stmt; }
    get fp() { return this._fp; }

    toString() { return "AssignKont"; }

    apply(returnValue, store) {
        let store_;
        if (this._name)
            store_ = Store.extend(store, this._fp.offset(this._name), returnValue);
        else
            store_ = store;
        return new State(this._stmt, this._fp, store_, this.next);
    }
}

class LeaveScopeKont extends Kont {
    constructor(stmt, fp, kont) {
        super(kont);
        this._stmt = stmt;
        this._fp = fp;
    }
    get stmt() { return this._stmt; }
    get fp() { return this._fp; }

    toString() { return "LeaveScopeKont"; }

    leaveScope(store) {
        return new State(this._stmt, this._fp, store, this.next);
    }
}

class HandlerKont extends Kont {
    constructor(catchClause, fp, kont) {
        super(kont);
        this._fp = fp;
        this._catchClause = catchClause;
    }

    get fp() { return this._fp; }
    get catchClause() { return this._catchClause; }

    toString() { return "HandlerKont"; }

    handle(thrown, store) {
        let catch_body = this._catchClause.body;
        let fp_ = this._fp;
        let store_ = store;
        let kont_ = this.next;
        
        if (catch_body._leave_scope_ins) {
            // if the catch block had a body at all we've already
            // inserted the %leaveScope() instruction.  in that case,
            // install a new environment with a single binding, and
            // start stepping through the inside of the catch clause's
            // block directly (note .body.body[0] instead of .body)

            fp_ = new Environment();
            store_ = Store.extend(store, fp_.offset(this._catchClause.param.name), thrown);
            fp_._parent = this._fp;
            kont_ = new LeaveScopeKont(catch_body._leave_scope_ins.nextStmt, this._fp, kont_);
            return new State(this._catchClause.body.body[0], fp_, store_, kont_);
        }

        return new State(this._catchClause.body, fp_, store_, kont_);
    }

    leaveHandler(store) {
        return new State(this._stmt, this._fp, store, this.next);
    }
}

class HaltKont extends Kont {
    constructor() { super(null); }

    toString() { return "HaltKont"; }

    apply(returnValue, store) {
        unimplemented("HaltKont.apply");
    }
    handle(thrown, store) {
        print("unhandled exception!");
        return new State(new CESKDone(), null, null, null);
    }
    leaveScope(store) {
        unimplemented("HaltKont.leaveScope");
    }
    leaveHandler(store) {
        unimplemented("HaltKont.leaveHandler");
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
        let kont_stack = "";
        let k = this.kont;
        while (k) {
            kont_stack += k.toString() + " ";
            k = k.next;
        }
        
        debug(`State.next called, current stmt = ${this.stmt.type}, kont stack = ${kont_stack}`);
        return this.stmt.step(this.fp, this.store, this.kont);
    }

    toString() { return `State(${this.stmt.type})`; }
}

// ast wrapper nodes so we can associate methods with ast types
let astNum = 0;
class CESKAst {
    constructor(astnode) {
        this._ast = astnode;
        this._id = astNum++;
    }
    get id() { return this._id; }
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
        this._params = astnode.params.map(wrap);
        // name
    }
    get params() { return this._ast.params; }
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

        let returnValue = GetValue(this._argument.eval(fp, store), store);
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

class CESKLeaveScope extends CESKStatement {
    constructor() {
        super(b.expressionStatement(b.callExpression(b.identifier("%leaveScope"), [])));
    }
    step(fp, store, kont) {
        debug("CESKLeaveScope.step");
        return kont.leaveScope(store);
    }
}

class CESKBlockStatement extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._body = astnode.body.map(wrap);
        // if we're not dealing with an empty block statement, append
        // a special "leave-scope" instruction to the end of the block
        // that will unwind our stack to the corresponding LeaveScopeKont
        // pushed onto the stack in step() below.
        if (this.body.length > 0) {
            this._leave_scope_ins = new CESKLeaveScope();
            this.body.push(this._leave_scope_ins);
        }
    }
    get body() { return this._body; }

    step(fp, store, kont) {
        debug("CESKBlockStatement.step");
        // easy - we just skip to the first statement inside the block
        // (or the first one afterward if the block is empty)
        let kont_ = kont;
        let fp_ = fp.push();
        if (this._leave_scope_ins) {
            kont_ = new LeaveScopeKont(this._leave_scope_ins.nextStmt, fp, kont);
        }
        return new State(this.nextStmt, fp_, store, kont_);
    }
}

class CESKLeaveHandler extends CESKStatement {
    constructor() {
        super(b.expressionStatement(b.callExpression(b.identifier("%leaveHandler"), [])));
    }
    step(fp, store, kont) {
        debug("CESKLeaveHandler.step");
        return kont.leaveHandler(store);
    }
}

class CESKTry extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._block = wrap(astnode.block);
        this._handlers = astnode.handlers.map(wrap);
        this._finalizer = wrap(astnode.finalizer);
        if (this.block.body.length > 0) {
            this._leave_handler_ins = new CESKLeaveHandler();
            this.block.body.push(this._leave_handler_ins);
        }
    }
    get block() { return this._block; }
    get handlers() { return this._handlers; }
    get finalizer() { return this._finalizer; }

    step(fp, store, kont) {
        debug("CESKTry.step");
        let kont_ = kont;
        if (this._leave_handler_ins) {
            debug("pushing handler kont");
            kont_ = new HandlerKont(this.handlers[0], fp, kont_);
            debug("pushing leave scope kont");
            kont_ = new LeaveScopeKont(this._leave_handler_ins.nextStmt, fp, kont_);
        }

        return new State(this.nextStmt, fp, store, kont_);
    }
}

class CESKCatchClause extends CESKAst {
    constructor(astnode) {
        super(astnode);
        this._body = wrap(astnode.body);
        this._param = wrap(astnode.param);
        // XXX skip the guard stuff, mozilla-only extension
    }
    get param() { return this._param; }
    get body() { return this._body; }

    step(fp, store, kont) {
        unimplemented("CESKCatchClause.step");
    }
}

class CESKThrow extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._argument = wrap(astnode.argument);
    }
    get argument() { return this._argument; }

    step(fp, store, kont) {
        let thrown = GetValue(this.argument.eval(fp, store), store);
        return kont.handle(thrown, store);
    }
}


function callFunc(callee, args, name, nextStmt, fp, store, kont) {
    let callee_ = GetValue(callee.eval(fp, store, kont), store);
    if (callee_ instanceof CBuiltinFunc) {
        let js_args = args.map((arg) => {
            return GetValue(arg.eval(fp, store, kont), store).value;
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
        debug("calling JS function");
        // allocate a new frame
        let fp_ = new Environment();

        let store_ = Store.clone(store);
        args.forEach((arg, n) => {
            let argval = GetValue(arg.eval(fp, store, kont), store);
            if (n < callee_.params.length) {
                store_._extend(fp_.offset(callee_.params[n].name), argval);
                debug(`${n} ${callee_.params[n].name} = ${GetValue(fp_.offset(callee_.params[n].name), store)}`);
            }
        });
        

        fp_._parent = fp;

        let kont_ = new AssignKont(name, nextStmt, fp, kont);
        return new State(callee_.body, fp_, store_, kont_);
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
            debug(` fp.getOffset(callee.name) is ${fp.getOffset(init.callee.name).toString()}`);
            return callFunc(init.callee, init.arguments, name, this.nextStmt, fp, store, kont);
        }
        else {
            let store_ = Store.clone(store);
            for (let decl of this.declarations) {
                let val = GetValue(decl.init.eval(fp, store, kont), store);
                debug(val.toString());
                store_._extend(fp.offset(decl.name), val);
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
        return fp.getOffset(this._ast.name);
    }
}

class CESKMemberExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._object = wrap(this._ast.object);
        // we convert all member expressions to computed.
        // so:
        //     foo.bar
        // becomes:
        //     foo['bar']
        //
        if (this._ast.property.type === b.Identifier)
            this._property = wrap(b.literal(this._ast.property.name));
        else
            this._property = wrap(this._ast.property);
    }
    get object() { return this._object; }
    get property() { return this._property; }
    eval(fp, store, kont) {
        let oref = this.object.eval(fp, store, kont);
        let oval = GetValue(oref, store);
        if (!(oval instanceof CObject))
            error("member expression with lhs not an object");
        return oval.get(this.property);
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
        let lref = this._left.eval(fp, store, kont);
        let lval = GetValue(lref, store);
        let rref = this._right.eval(fp, store, kont);
        let rval = GetValue(rref, store);
        switch (this.operator) {
        case '+': return new CNum(lval.value + rval.value);
        case '-': return new CNum(lval.value - rval.value);
        case '<': { 
            let r = AbstractRelationalComparison(lval, rval, true);
            if (r.value === undefined)
                return CBool.False;
            return r;
        }
        case '>': { 
            let r = AbstractRelationalComparison(rval, lval, false);
            if (r.value === undefined)
                return CBool.False;
            return r;
        }
        case '<=': { 
            let r = AbstractRelationalComparison(rval, lval, false);
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
        case '==': {
            return AbstractEqualityComparison(lval, rval);
        }
        case '!=': {
            let r = AbstractEqualityComparison(lval, rval);
            return r.value === true ? CBool.False : CBool.True;
        }
        case '===': {
            return StrictEqualityComparison(lval, rval);
        }
        case '!==': {
            let r = StrictEqualityComparison(lval, rval);
            return r.value === true ? CBool.False : CBool.True;
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
        let lval = ToBoolean(GetValue(this._left.eval(fp, store, kont), store));
        let rval = ToBoolean(GetValue(this._right.eval(fp, store, kont), store));
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
        let lref = this._left.eval(fp, store, kont);

        let rref = this._right.eval(fp, store, kont);
        let rval = GetValue(rref, store);

        PutValue(lref, rval, store);
        
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
        let val = GetValue(this._expression.eval(fp, store, kont), store);
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
        return callFunc(this._callee, this._arguments, undefined, this.nextStmt, fp, store, kont);
    }
}

class CESKObjectExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._properties = astnode.properties.map(wrap);
    }
    get properties() { return this._properties; }
    eval(fp, store, kont) {
        let rv = new CObject(fp.getOffset("%ObjectPrototype%"), store);
        // XXX properties
        return rv;
    }
}

class CESKArrayExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._elements = astnode.elements.map(wrap);
    }
    get elements() { return this._elements; }
    eval(fp, store, kont) {
        unimplemented("CESKArrayExpression.eval");
    }
}

class CESKIf extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._test = wrap(astnode.test);
        this._consequent = wrap(astnode.consequent);
        this._alternate = wrap(astnode.alternate);
    }
    get test() { return this._test; }
    get consequent() { return this._consequent; }
    get alternate() { return this._alternate; }
    step(fp, store, kont) {
        let testValue = ToBoolean(GetValue(this._test.eval(fp, store), store));
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
        let testValue = ToBoolean(GetValue(this._test.eval(fp, store), store));
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
    if (!astnode) return astnode;

    switch(astnode.type) {
    case b.ArrayExpression: return new CESKArrayExpression(astnode);
    case b.ArrayPattern: return unimplemented('ArrayPattern');
    case b.ArrowFunctionExpression: return unimplemented('ArrowFunctionExpression');
    case b.AssignmentExpression: return new CESKAssignmentExpression(astnode);
    case b.BinaryExpression: return new CESKBinaryExpression(astnode);
    case b.BlockStatement: return new CESKBlockStatement(astnode);
    case b.BreakStatement: return unimplemented('BreakStatement');
    case b.CallExpression: return new CESKCallExpression(astnode);
    case b.CatchClause: return new CESKCatchClause(astnode);
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
    case b.MemberExpression: return new CESKMemberExpression(astnode);
    case b.MethodDefinition: return unimplemented('MethodDefinition');
    case b.ModuleDeclaration: return unimplemented('ModuleDeclaration');
    case b.NewExpression: return unimplemented('NewExpression');
    case b.ObjectExpression: return new CESKObjectExpression(astnode);
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
    case b.ThrowStatement: return new CESKThrow(astnode);
    case b.TryStatement: return new CESKTry(astnode);
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
        assignNext(stmt.consequent, next);
        if (stmt.alternate)
            assignNext(stmt.alternate, next);
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
    else if (stmt.type === b.TryStatement) {
        assignNext(stmt.handlers[0].body, next);
        assignNext(stmt.block, next);
        stmt._nextStmt = stmt.block.body[0];
    }
    else {
        stmt._nextStmt = next;
    }
}

function initES6Env(fp0, store0) {
    store0._extend(fp0.offset("print"), new CBuiltinFunc(1, function _print(x) { console.log(x); }));

    let object_prototype = new CObject(Store.NullPointer, store0);
    store0._extend(fp0.offset("%ObjectPrototype%"), object_prototype);
    object_prototype.set(new CStr("hasOwnProperty"), new CBuiltinFunc(1, function _hasOwnProperty(self, needle) { unimplemented("builtin-hasOwnProperty"); }), store0);
    object_prototype.set(new CStr("toString"), new CBuiltinFunc(1, function _toString(self) { print("[object Object]"); }), store0);
}

function execute(toplevel) {
    maxPointer = 0;

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

function dumpStatements(ast, indent = 0) {
    if (!ast) return;
    switch(ast.type) {
    case b.Program:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        ast.body.forEach((el) => dumpStatements(el, indent + 2));
        break;
    case b.BlockStatement:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        ast.body.forEach((el) => dumpStatements(el, indent + 2));
        break;
    case b.IfStatement:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        console.log(`${" ".repeat(indent+2)}then:`);
        dumpStatements(ast.consequent, indent + 2);
        console.log(`${" ".repeat(indent+2)}else:`);
        dumpStatements(ast.alternate, indent + 2);
        break;
    case b.WhileStatement:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        dumpStatements(ast.body, indent + 2);
        break;
    case b.TryStatement:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
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
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        dumpStatements(ast.body, indent + 1);
        break;
    case b.ExpressionStatement:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type} ${escodegen.generate(ast._ast)}`);
        break;
    default:
        console.log(`${" ".repeat(indent)}${ast.id}: ${ast.type}`);
        break;
    }
}

function runcesk(name, program_text) {
    var test = esprima.parse(program_text);
    var cesktest = wrap(test);
    assignNext(cesktest, new CESKDone());
    cesktest = toANF(cesktest);
    if (_debug) dumpStatements(cesktest);
    let timer = `runcesk ${name}`;
    console.time(timer);
    execute(cesktest);
    console.timeEnd(timer);
}

if (process.argv.length === 1)
    error("must specify test to run on command line, ex: ./jscesk.exe tests/func-call.js");

let test_file = process.argv[1];
let test_contents = fs.readFileSync(test_file, 'utf-8');

runcesk(test_file, test_contents);
