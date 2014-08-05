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
INSTALLPATH=$(BUILDDIR)/usr/lib/nodejs/dbaas-proxy

all: build

build: $(wildcard lib/*.js)
	touch $@;
	mkdir -p $(INSTALLPATH)
	cp -R bin node_modules lib $(INSTALLPATH)
	find $(INSTALLPATH)/node_modules -type f -exec chmod 644 {} \;
	find $(INSTALLPATH)/lib -type f -exec chmod 644 {} \;
	mkdir -p $(BUILDDIR)/usr/bin/
	ln -s ../lib/nodejs/dbaas-proxy/bin/dbaas-proxy-api.js dist/usr/bin/dbaas-proxy-api.js
	ln -s ../lib/nodejs/dbaas-proxy/bin/dbaas-proxy-monitor.js dist/usr/bin/dbaas-proxy-monitor.js
	mkdir -p $(BUILDDIR)/etc/init.d/
	cp dbaas-proxy-api.init.d $(BUILDDIR)/etc/init.d/dbaas-proxy-api
	cp dbaas-proxy-monitor.init.d $(BUILDDIR)/etc/init.d/dbaas-proxy-monitor


clean:
	rm -fr $(BUILDDIR) build

install: build
	install -d $(DBAASPROXYLIBDIR)
	cp -av $(BUILDDIR)/usr $(DBAASPROXYLIBDIR)/
	cp -av $(BUILDDIR)/etc $(DBAASPROXYLIBDIR)/

dist: build

	tar czvf dbaas-proxy_$(VERSION).tar.gz -C$(BUILDDIR) usr/

lint:	$(LINTSOURCES)
	node node_modules/.bin/nodelint --config .jslint.conf $(LINTSOURCES); echo

test:	$(TESTSOURCES)
	node node_modules/.bin/nodeunit $(TESTSOURCES); echo
