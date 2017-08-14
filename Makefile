
EJSDIR?=/Users/toshok/src/echojs/echojs

jscesk.exe: jscesk.js
	$(EJSDIR)/ejs --srcdir --moduledir $(EJSDIR)/node-compat -o $@ $<

check_%: tests/%.js
	babel-node jscesk.js $<
