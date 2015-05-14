import { CBool, CBuiltinFunc, CNull, CNum, CObject, CStr, CSym, CUndefined } from './concrete';
import { unimplemented, debug, error, print } from './utils';
import { Pointer } from './pointer';
import { Store } from './store';

// JS spec functions

export function GetValue(arg, store) {
    if (arg instanceof Pointer) {
        return store.get(arg);
    }
    return arg;
}

export function PutValue(ref, val, store) {
    if (ref instanceof Pointer) {
        store._extend(ref, val);
        return;
    }

    error ("PutValue passed non-ref first arg");
}

// 7.1.1
export function ToPrimitive(input, PreferredType) {
    if (input instanceof CUndefined) { return input; }
    else if (input instanceof CNull) { return input; }
    else if (input instanceof CBool) { return input; }
    else if (input instanceof CNum)  { return input; }
    else if (input instanceof CStr)  { return input; }
    else if (input instanceof CSym)  { return input; }
    else if (input instanceof CObject) {
        let hint;
        // 1. If PreferredType was not passed, let hint be "default".
        if (!PreferredType)
            hint = "default";
        // 2. Else if PreferredType is hint String, let hint be "string".
        // 3. Else PreferredType is hint Number, let hint be "number".
        else
            hint = PreferredType;
        // 4. Let exoticToPrim be GetMethod(input, @@toPrimitive).
        // 5. ReturnIfAbrupt(exoticToPrim).
        let exoticToPrim = GetMethod(input, '@@toPrimitive'); // XXX
        // 6. If exoticToPrim is not undefined, then
        if (!(exoticToPrim instanceof CUndefined)) {
            // a. Let result be Call(exoticToPrim, input, «hint»).
            // b. ReturnIfAbrupt(result).
            // c. If Type(result) is not Object, return result.
            // d. Throw a TypeError exception.
        }
        // 7. If hint is "default", let hint be "number".
        if (hint === "default")
            hint = "number";
        // 8. Return OrdinaryToPrimitive(input,hint).
        return OrdinaryToPrimitive(input, hint);
    }
    return unimplemented(`ToPrimitive ${input.toString()}`);
}

function OrdinaryToPrimitive(input, hint) {
    // 1. Assert: Type(O) is Object
    // 2. Assert: Type(hint) is String and its value is either "string" or "number".
    // 3. If hint is "string", then
    // a. Let methodNames be «"toString", "valueOf"».
    // 4. Else,
    // a. Let methodNames be «"valueOf", "toString"».
    // 5. For each name in methodNames in List order, do
    // a. Let method be Get(O, name).
    // b. ReturnIfAbrupt(method).
    // c. If IsCallable(method) is true, then
    // i. Let result be Call(method, O).
    // ii. ReturnIfAbrupt(result).
    // iii. If Type(result) is not Object, return result.
    // 6. Throw a TypeError exception
    return unimplemented("OrdinaryToPrimitive");
}

// 7.1.2
export function ToBoolean(val) {
    if (val instanceof CBool) { return val; }
    else if (val instanceof CUndefined) { return CBool.False; }
    else if (val instanceof CNull) { return CBool.False; }
    else if (val instanceof CNum) { return (isNaN(val.value) || val.value === 0) ? CBool.True : CBool.False; }
    else if (val instanceof CStr) { return val.value === "" ? CBool.True : CBool.False; }
    else if (val instanceof CObject) return CBool.True;
    else if (val instanceof CSym) return CBool.True;
    return unimplemented("ToBoolean");
}


// 7.1.3
export function ToNumber(val) {
    if (val.value === undefined) { return new CNum(NaN); }
    else if (val.value === null) { return new CNum(0); }
    else if (val instanceof CBool) { return new CNum(val.value ? 1 : 0); }
    else if (val instanceof CNum) { return val; }

    return unimplemented("missing ToNumber() support");
}

// 7.1.12
export function ToString(argument) {
    // we cheat here.  this won't work for our objects / symbols
    if (argument instanceof CObject) return unimplemented("ToString(Object)");
    if (argument instanceof CSym) return unimplemented("ToString(Symbol)");
    return new CStr(String(argument.value));
}

// 7.2.11
export function AbstractRelationalComparison(x, y, leftFirst) {
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
        if (isNaN(nx.value)) return new CUndefined();
        // f. If ny is NaN, return undefined.
        if (isNaN(ny.value)) return new CUndefined();

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
export function AbstractEqualityComparison(x, y) {
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
export function StrictEqualityComparison(x, y) {
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

// 7.3.1 Get (O, P)
function Get (O, P) {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let O be ToObject(V).
    // 3. ReturnIfAbrupt(O).
    // 4. Return O.[[Get]](P, V).
    return unimplemented("Get");
}

// 7.3.2 GetV (O, P)
function GetV (O, P) {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let O be ToObject(V).
    // 3. ReturnIfAbrupt(O).
    // 4. Return O.[[Get]](P, V).
    return unimplemented("GetV");
}

// 7.3.9 GetMethod (O, P)
function GetMethod (O, P) {
    // 1. Assert: IsPropertyKey(P) is true.
    // 2. Let func be GetV(O, P).
    // 3. ReturnIfAbrupt(func).
    let func = GetV(O, P);
    // 4. If func is either undefined or null, return undefined.
    if ((func instanceof CUndefined) || (func instanceof CNull)) return new CUndefined();
    // 5. If IsCallable(func) is false, throw a TypeError exception.
    // 6. Return func.
    return func;
}

export function initES6Env(fp0, store0) {
    store0._extend(fp0.offset("print"), new CBuiltinFunc(1, function _print(x) { console.log(x); }));
    store0._extend(fp0.offset("undefined"), new CUndefined());

    let object_prototype = new CObject(Store.NullPointer, store0);
    store0._extend(fp0.offset("%ObjectPrototype%"), object_prototype);
    object_prototype.set(new CStr("hasOwnProperty"), new CBuiltinFunc(1, function _hasOwnProperty(self, needle) { unimplemented("builtin-hasOwnProperty"); }), store0);
    object_prototype.set(new CStr("toString"), new CBuiltinFunc(1, function _toString(self) { print("[object Object]"); }), store0);
}

