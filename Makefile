
EJSDIR?=/Users/toshok/src/coffeekit/echo-js

jscesk.exe: jscesk.js
	$(EJSDIR)/ejs --srcdir --moduledir $(EJSDIR)/node-compat -o $@ $<
