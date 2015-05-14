import * as es6 from './es6';
import { Environment } from './env';
import { Pointer } from './pointer';
import { warn_unimplemented } from './utils';

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

export class CBool extends CVal {
    constructor(val) {
        super(val);
    }

    static get False() { return _cbool_false; }
    static get True() { return _cbool_true; }
    toString() { return `CBool(${this.value})`; }
}

_cbool_false = new CBool(false);
_cbool_true = new CBool(true);

export class CObject extends CVal {
    constructor(proto_addr, store) {
        let proto = es6.GetValue(proto_addr, store);
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

export class CArray extends CObject {
    constructor(val) {
        super(val);
    }
    toString() { return `CArray`; }
}

export class CFunction extends CVal /* CObject */ {
    constructor(val) {
        super(val);
    }
    toString() { return `CFunction ${this.value.id ? this.value.id.name : "anon"}`; }
}

export class CNum extends CVal {
    constructor(num) { super(num); }
    toString() { return `CNum(${this.value})`; }
}

export class CStr extends CVal {
    constructor(str) { super(str); }
    toString() { return `CStr(${this.value})`; }
}

export class CSym extends CVal {
    constructor(sym) { super(sym); }
    toString() { return `CStr(${this.value})`; }
}

export class CNull extends CVal {
    constructor() { super(null); }
    toString() { return `CNull()`; }
}

export class CUndefined extends CVal {
    constructor() { super(undefined); }
    toString() { return `CUndefined()`; }
}

export class CBuiltinFunc extends CVal {
    constructor(arity, fun) {
        super(fun);
        this._arity = arity;
    }
    toString() { return `CBuiltinFunc(${this._arity}, ${this.value})`; }
}
