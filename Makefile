BIN = ./node_modules/.bin
SRC = $(shell find src -name '*.js')
LIB = $(SRC:src/%=lib/%)

build: $(LIB)

example::
	@$(BIN)/babel-node ./example/server.js

install link:
	@npm $@

test::
	$(BIN)/babel-node $(BIN)/webpack \
		--bail \
		--context example/ \
		--config example/webpack.config.js

lint::

release-patch: build test lint
	@$(call release,patch)

release-minor: build test lint
	@$(call release,minor)

release-major: build test lint
	@$(call release,major)

publish:
	git push --tags origin HEAD:master
	npm publish

lib/%.js: src/%.js
	@echo "building $@"
	@mkdir -p $(@D)
	@$(BIN)/babel -o $@ $<

clean:
	@rm -f $(LIB)

define release
	npm version $(1)
endef
