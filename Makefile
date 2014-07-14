PACKAGE = dbaas-proxy
NODEJS = $(if $(shell test -f /usr/bin/nodejs && echo "true"),nodejs,node)
VERSION = $(shell grep version package.json |awk 'match($$0, /[0-9]+\.[0-9]+\.[0-9]+/) { print substr($$0, RSTART, RLENGTH)}')

PREFIX ?= /usr/local
BINDIR ?= $(PREFIX)/bin
DATADIR ?= $(PREFIX)/share
MANDIR ?= $(PREFIX)/share/man
LIBDIR ?= $(PREFIX)/lib
DBAASPROXYLIBDIR ?= $(LIBDIR)/$(NODEJS)

BUILDDIR = dist

BIN=bin/dbaas-proxy-api.js
LINTSOURCES=$(shell find bin lib -name '*.js' -print)
TESTSOURCES=$(shell find test -name 'test*.js' -print)

all: build

build: $(wildcard lib/*.js)
	touch $@;
	mkdir -p $(BUILDDIR)/dbaas-proxy
	cp -R bin node_modules lib $(BUILDDIR)/dbaas-proxy

clean:
	rm -fr $(BUILDDIR) build

install: build
	install -d $(DBAASPROXYLIBDIR)
	cp -a $(BUILDDIR)/dbaas-proxy $(DBAASPROXYLIBDIR)

dist: build

	tar czvf dbaas-proxy_$(VERSION).tar.gz -C$(BUILDDIR) dbaas-proxy/

lint:	$(LINTSOURCES)
	node node_modules/.bin/nodelint --config .jslint.conf $(LINTSOURCES); echo

test:	$(TESTSOURCES)
	node node_modules/.bin/nodeunit $(TESTSOURCES); echo
