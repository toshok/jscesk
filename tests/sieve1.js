function primes (n) {
    function primes_internal (cur, remaining, filter) {
	let u5 = print("testing: ");
	let u6 = print(cur);
	let u7 = print(remaining);
	if (remaining === 0)
	    return;
	else {
	    let t = filter(cur);
	    let nt = !t;
	    if (nt) {
		let u1 = print (cur);
		let prime_filter = function prime_filter (test) {
		    let mod = test%cur;
		    if (mod === 0) { let u4 = print("mod === 0"); return true; }
		    let ft = filter (test);
		    if (ft) { let u5 = print("upchain filter returned true"); return true; }
		    return false;
		};
		primes_internal (cur+1, remaining-1, prime_filter);
	    }
	    else {
		let u3 = print ("about to call prime_internals 2");
		
      		primes_internal (cur+1, remaining, filter);
	    }
	}
    }
    
    primes_internal (2, n, function base_filter (test) { return false; });
}

primes (100);
