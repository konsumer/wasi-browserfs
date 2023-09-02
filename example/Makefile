WASI_SDK_PATH = /opt/wasi-sdk-20.0
CC = ${WASI_SDK_PATH}/bin/clang --sysroot=${WASI_SDK_PATH}/share/wasi-sysroot

simple.wasm: simple.c
	${CC} -o $@ -Ofast -Wl,--export=malloc -Wl,--export=free $?

.PHONY: clean
clean:
	@rm -f simple.wasm