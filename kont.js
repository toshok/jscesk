import { Store } from './store';
import { State } from './state';
import { Environment } from './env';
import { print, error, unimplemented } from './utils';
import { CESKDone } from './ast';

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
export class AssignKont extends Kont {
    constructor(name, stmt, fp, kont) {
        super(kont);
        this._name = name;
        this._stmt = stmt;
        this._fp = fp;
    }
    get stmt() { return this._stmt; }
    get fp() { return this._fp; }

    toString() { return 'AssignKont'; }

    apply(returnValue, store) {
        let store_;
        if (this._name)
            store_ = Store.extend(store, this._fp.offset(this._name), returnValue);
        else
            store_ = store;
        return new State(this._stmt, this._fp, store_, this.next);
    }
}

export class LeaveScopeKont extends Kont {
    constructor(stmt, fp, kont) {
        super(kont);
        this._stmt = stmt;
        this._fp = fp;
    }
    get stmt() { return this._stmt; }
    get fp() { return this._fp; }

    toString() { return 'LeaveScopeKont'; }

    leaveScope(store) {
        return new State(this._stmt, this._fp, store, this.next);
    }
}

export class HandlerKont extends Kont {
    constructor(catchClause, fp, kont) {
        super(kont);
        this._fp = fp;
        this._catchClause = catchClause;
    }

    get fp() { return this._fp; }
    get catchClause() { return this._catchClause; }

    toString() { return 'HandlerKont'; }

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

export class HaltKont extends Kont {
    constructor() { super(null); }

    toString() { return 'HaltKont'; }

    apply(returnValue, store) {
        unimplemented('HaltKont.apply');
    }
    handle(thrown, store) {
        print('unhandled exception!');
        return new State(new CESKDone(), null, null, null);
    }
    leaveScope(store) {
        unimplemented('HaltKont.leaveScope');
    }
    leaveHandler(store) {
        unimplemented('HaltKont.leaveHandler');
    }
}
