import { error } from './utils';
import { Pointer } from './pointer';
import { CNull } from './concrete';

export class Environment {
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
    toString() {
        let e = this;
        let str = `Environment(`;
        while (e) {
            if (e != this) str += "\n------";
            for (let name in e._offsets) {
                str += `\n   ${name} = ${this._offsets[name]}`;
            }
            e = e._parent;
        }
        return str + ")";
    }
}
