TEMPLATE_VERSION := perfmap

.PHONY: build clean FORCE

build: dist/tidb-query-duration.html

clean:
	@rm -rfv dist

dist/%.html: src/%.md Makefile
	@mkdir -p dist
	@echo generating $@
	@curl -sL https://raw.githubusercontent.com/zyguan/railroad-diagrams/$(TEMPLATE_VERSION)/template.html | sed -e "s/^__TITLE__$$/$(shell sed -n -e '/^#/ {s/#\s\+//;p;q}' $<)/" -e "/^__MARKDOWN__$$/{r $<" -e "d}" > $@
