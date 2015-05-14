import * as b from './ast-builder';
import { debug, error, unimplemented } from './utils';
import { AssignKont, LeaveScopeKont, HandlerKont } from './kont';
import { Environment } from './env';
import { Store } from './store';
import { State } from './state';
import { CBool, CBuiltinFunc, CFunction, CObject, CStr, CNum, CUndefined } from './concrete';
import * as es6 from './es6';

import * as escodegen from './escodegen-es6';

// ast wrapper nodes so we can associate methods with ast types
let astNum = 0;
class CESKAst {
    constructor(astnode) {
        this._ast = astnode;
        this._astid = astNum++;
    }
    get astid() { return this._astid; }
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
    get id() { return this._ast.id; }
    get name() { return this._ast.id.name; }
    
    step(fp, store, kont) {
        debug(`CESKFunctionDeclaration(${this.name}).step`);
        debug(`  offset = ${fp.offset(this.name)}`);
	debug(`  environment = ${fp.toString()}`);

        // a function declaration extends the local environment with a
        // mapping from the function's name to the function.
        this._fp = fp;
        let store_ = Store.extend(store, fp.offset(this.name), new CFunction(this));
        return new State(this.nextStmt, fp, store_, kont);
    }
    toString() { return `CESKFunctionDeclaration(${this.name}, ${escodegen.generate(this._ast.body)})`; }
}

class CESKFunctionExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._body = wrap(astnode.body);
        this._params = astnode.params.map(wrap);
        // name
        assignNext(this.body, null);
    }
    get params() { return this._ast.params; }
    get body() { return this._body; }
    get id() { return this._ast.id; }
    get name() { return this._ast.id.name; }
    
    eval(fp, store, kont) {
        this._fp = fp;
        return new CFunction(this);
    }
    toString() { return `CESKFunctionExpression(${this.name}, ${escodegen.generate(this._ast.body)})`; }
}

class CESKReturn extends CESKStatement {
    constructor(astnode) {
        super(astnode);
        this._argument = wrap(astnode.argument) || new CUndefined();
    }
    get body() { return this._body; }

    step(fp, store, kont) {
        debug("CESKReturn.step");

        let returnValue = es6.GetValue(this._argument.eval(fp, store), store);
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
        let thrown = es6.GetValue(this.argument.eval(fp, store), store);
        return kont.handle(thrown, store);
    }
}


function callFunc(callee, args, name, nextStmt, fp, store, kont) {
    let callee_ = es6.GetValue(callee.eval(fp, store, kont), store);
    if (callee_ instanceof CBuiltinFunc) {
        let js_args = args.map((arg) => {
            return es6.GetValue(arg.eval(fp, store, kont), store).value;
        });
        let kont_ = new AssignKont(name, nextStmt, fp, kont);
        return kont_.apply(callee_.value.apply(undefined, js_args), store);
    }
    else if (callee_ instanceof CFunction) {
        let calleeFunc = callee_.value;
        debug(`calling JS function ${callee_.toString()}`);
        debug(`in context of environment: ${calleeFunc._fp.toString()}`);
        // allocate a new frame
        let fp_ = new Environment();

        let store_ = Store.clone(store);
        args.forEach((arg, n) => {
            let argval = es6.GetValue(arg.eval(fp, store, kont), store);
            if (n < calleeFunc.params.length) {
                store_._extend(fp_.offset(calleeFunc.params[n].name), argval);
                debug(`${n} ${calleeFunc.params[n].name} = offset ${fp_.offset(calleeFunc.params[n].name)} ${es6.GetValue(fp_.offset(calleeFunc.params[n].name), store_)}`);
            }
        });
        

        fp_._parent = calleeFunc._fp;

        let kont_ = new AssignKont(name, nextStmt, fp, kont);
        return new State(calleeFunc._body, fp_, store_, kont_);
    }
    else {
        debug(callee_.toString());
        return error("callee is not a function");
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
                let val = es6.GetValue(decl.init.eval(fp, store, kont), store);
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
        let oval = es6.GetValue(oref, store);
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
        let lval = es6.GetValue(lref, store);
        let rref = this._right.eval(fp, store, kont);
        let rval = es6.GetValue(rref, store);
        switch (this.operator) {
        case '+': {
            // 7. Let lprim be ToPrimitive(lval).
            // 8. ReturnIfAbrupt(lprim).
            let lprim = es6.ToPrimitive(lval);
            // 9. Let rprim be ToPrimitive(rval).
            // 10. ReturnIfAbrupt(rprim).
            let rprim = es6.ToPrimitive(rval);
            // 11. If Type(lprim) is String or Type(rprim) is String, then
            if ((lprim instanceof CStr) || (rprim instanceof CStr)) {
                // a. Let lstr be ToString(lprim).
                // b. ReturnIfAbrupt(lstr).
                let lstr = es6.ToString(lprim);
                // c. Let rstr be ToString(rprim).
                // d. ReturnIfAbrupt(rstr).
                let rstr = es6.ToString(rprim);
                // e. Return the String that is the result of concatenating lstr and rstr.
                return new CStr(lstr.value + rstr.value);
            }
            // 12. Let lnum be ToNumber(lprim).
            // 13. ReturnIfAbrupt(lnum).
            let lnum = es6.ToNumber(lprim);
            // 14. Let rnum be ToNumber(rprim).
            // 15. ReturnIfAbrupt(rnum).
            let rnum = es6.ToNumber(rprim);
            // 16. Return the result of applying the addition operation to lnum and rnum. See the Note below 12.7.5.
            return new CNum(lnum.value + rnum.value);
        }
        case '%': case '/': case '*': {
            //print("multiplicative expression!");
            // 1. Let left be the result of evaluating MultiplicativeExpression.
            // 2. Let leftValue be GetValue(left).
            // 3. ReturnIfAbrupt(leftValue).
            // 4. Let right be the result of evaluating UnaryExpression.
            // 5. Let rightValue be GetValue(right).
            // 6. Let lnum be ToNumber(leftValue).
            // 7. ReturnIfAbrupt(lnum).
            let lnum = es6.ToNumber(lval);
            // 8. Let rnum be ToNumber(rightValue).
            // 9. ReturnIfAbrupt(rnum).
            let rnum = es6.ToNumber(rval);
            // 10. Return the result of applying the
            //     MultiplicativeOperator (*, /, or %) to lnum and rnum as
            //     specified in 12.6.3.1, 12.6.3.2, or 12.6.3.3.
            switch (this.operator) {
            case '*': return new CNum(lnum.value * rnum.value);
            case '/': return new CNum(lnum.value / rnum.value);
            case '%': /*print(`${lnum.value} % ${rnum.value} = ${lnum.value % rnum.value}`);*/ return new CNum(lnum.value % rnum.value);
            }
        }
        case '-': return new CNum(lval.value - rval.value);
        case '<': { 
            let r = es6.AbstractRelationalComparison(lval, rval, true);
            if (r.value === undefined)
                return CBool.False;
            return r;
        }
        case '>': { 
            let r = es6.AbstractRelationalComparison(rval, lval, false);
            if (r.value === undefined)
                return CBool.False;
            return r;
        }
        case '<=': { 
            let r = es6.AbstractRelationalComparison(rval, lval, false);
            if (r.value === undefined || r.value === true)
                return CBool.False;
            return CBool.True;
        }
        case '>=': { 
            let r = es6.AbstractRelationalComparison(lval, rval, true);
            if (r.value === undefined || r.value === true)
                return CBool.False;
            return CBool.True;
        }
        case '==': {
            return es6.AbstractEqualityComparison(lval, rval);
        }
        case '!=': {
            let r = es6.AbstractEqualityComparison(lval, rval);
            return r.value === true ? CBool.False : CBool.True;
        }
        case '===': {
            return es6.StrictEqualityComparison(lval, rval);
        }
        case '!==': {
            let r = es6.StrictEqualityComparison(lval, rval);
            return r.value === true ? CBool.False : CBool.True;
        }
        default: return unimplemented(`unrecognized binary operation: ${this.operator}`);
        }
    }
}

class CESKUnaryExpression extends CESKExpression {
    constructor(astnode) {
        super(astnode);
        this._argument = wrap(astnode.argument);
    }
    get operator() { return this._ast.operator; }
    get argument() { return this._argument; }
    eval(fp, store, kont) {
        switch (this.operator) {
        case '!': {
            // 1. Let expr be the result of evaluating UnaryExpression.
            let expr = this._argument.eval(fp, store, kont);
            // 2. Let oldValue be ToBoolean(GetValue(expr)).
            // 3. ReturnIfAbrupt(oldValue).
            let oldValue = es6.GetValue(expr, store);
            // 4. If oldValue is true, return false.
            if (oldValue === CBool.True) return CBool.False;
            // 5. Return true.
            return CBool.True;
        }
        default: return unimplemented(`unrecognized unary operation: ${this.operator}`);
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
        debug("CESKLogicalExpression.eval");
        let lval = es6.ToBoolean(es6.GetValue(this._left.eval(fp, store, kont), store));
        let rval = es6.ToBoolean(es6.GetValue(this._right.eval(fp, store, kont), store));
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
        let rval = es6.GetValue(rref, store);

        es6.PutValue(lref, rval, store);
        
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
        let val = es6.GetValue(this._expression.eval(fp, store, kont), store);
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
        if (typeof(this._ast.value) === "number") {
            return new CNum(this._ast.value);
	}
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
        let testValue = es6.ToBoolean(es6.GetValue(this._test.eval(fp, store), store));
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
        let testValue = es6.ToBoolean(es6.GetValue(this._test.eval(fp, store), store));
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

export class CESKDone extends CESKStatement {
    constructor() {
        super({ type: "Done" });
        this.done = true;
    }
    step(fp, store, kont) {
        error("shouldn't reach here");
    }
}

export function wrap(astnode) {
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
    case b.FunctionExpression: return new CESKFunctionExpression(astnode);
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
    case b.UnaryExpression: return new CESKUnaryExpression(astnode);
    case b.UpdateExpression: return unimplemented('UpdateExpression');
    case b.VariableDeclaration: return new CESKVariableDeclaration(astnode);
    case b.VariableDeclarator: return new CESKVariableDeclarator(astnode);
    case b.WhileStatement: return new CESKWhile(astnode);
    case b.WithStatement: return unimplemented('WithStatement');
    case b.YieldExpression: return unimplemented('YieldExpression');
    default: return unimplemented(astnode.type);
    }
}

// adds a link from each statement to the next one (or null if there isn't one)
export function assignNext(stmt, next) {
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
    else if (stmt.type === b.FunctionExpression) {
        assignNext(stmt.body, null);
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

