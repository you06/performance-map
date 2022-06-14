TEMPLATE_VERSION := 5736c7fdefbe282557479e4890a5c37f8b39341b

.PHONY: build clean FORCE

build: dist/tidb-query-duration.html

clean:
	@rm -rfv dist

dist/%.html: src/%.md Makefile
	@mkdir -p dist
	@echo generating $@
	@curl -sL https://cdn.jsdelivr.net/gh/zyguan/railroad-diagrams@$(TEMPLATE_VERSION)/template.html | sed -e "s/^__TITLE__$$/$(shell sed -n -e '/^#/ {s/#\s\+//;p;q}' $<)/" -e "/^__MARKDOWN__$$/{r $<" -e "d}" > $@
