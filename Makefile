BIN=bin/api.js
LINTSOURCES=$(shell find bin lib -name '*.js' -print)
TESTSOURCES=$(shell find test -name 'test*.js' -print)

lint:	$(LINTSOURCES)
	node node_modules/.bin/nodelint --config .jslint.conf $(LINTSOURCES); echo

test:	$(TESTSOURCES)
	node node_modules/.bin/nodeunit $(TESTSOURCES); echo
