function fib(n) {
    if (n < 2) return 1;
    n = n - 2;
    let i = 0;
    let fib1 = 1;
    let fib2 = 1;
    while (i <= n) {
        let nfib = fib1 + fib2;
        fib1 = fib2;
        fib2 = nfib;
        i = i + 1;
    }
    return fib2;
}
let fib8 = fib(8);
let unused = print(fib8);
