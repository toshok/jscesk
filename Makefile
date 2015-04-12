
jscesk.exe: jscesk.js
	ejs --srcdir -o $@ $<

check: jscesk.exe
	./jscesk.exe
