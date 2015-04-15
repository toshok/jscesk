function fib(n) {
    if (n === 0) return 1;
    if (n === 1) return 1;

    let n_1 = n-1;
    let n_2 = n-2;
    let fib_1 = fib(n_1);
    let fib_2 = fib(n_2);
    let rv = fib_1 + fib_2;
    return rv;
}
let fib8 = fib(8);
let unused = print(fib8);
