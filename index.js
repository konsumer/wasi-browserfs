import memhelpers from 'cmem_helpers'
import * as BrowserFS from 'browserfs'

export const { Buffer } = BrowserFS.BFSRequire('buffer')

const WASI_ESUCCESS = 0
const WASI_EBADF = 8
const WASI_EIO = 29

const PREOPENTYPE_DIR = 0

const FILENO_STDIN = 0
const FILENO_STDOUT = 1
const FILENO_STDERR = 2

const encoder = new TextEncoder()

// this will maybe eventually be upstream
// https://github.com/jvilk/BrowserFS/issues/366
export const getFs = options => new Promise((resolve, reject) => {
  BrowserFS.configure(options, err => {
    if (err) {
      return reject(err)
    }
    resolve(BrowserFS.BFSRequire('fs'))
  })
})

export function setup (fs, stdout = console.log, stderr = console.error) {
  let instance

  const getDataView = () => {
    if (!instance?.exports?.memory) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return new DataView(instance.exports.memory.buffer)
  }

  const getSlice32 = (addr, len) => {
    if (!instance?.exports?.memory) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return new Uint32Array(instance?.exports?.memory?.buffer, addr, len)
  }

  const getSlice8 = (addr, len) => {
    if (!instance?.exports?.memory) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return new Uint8Array(instance?.exports?.memory?.buffer, addr, len)
  }

  const getHelpers = () => {
    if (!instance?.exports?.memory || !instance?.exports?.malloc) {
      throw new Error('You must set instance before calling anything that uses memory. It should export malloc and memory.')
    }
    return memhelpers(instance?.exports?.memory?.buffer, instance?.exports?.malloc)
  }

  class Iovec {
    constructor (iovsPtr, iovsLength) {
      const d = getSlice32(iovsPtr, iovsLength * 8)
      this.iovs = []
      for (let i = 0; i < (iovsLength * 2); i += 2) {
        this.iovs.push([d[i], d[i + 1]])
      }
    }

    // put some bytes into iovecs, return total size read
    read (source) {
      let offset = 0
      for (const [ptr, len] of this.iovs) {
        if (offset >= source.length) {
          break
        }
        const b = getSlice8(ptr, len)
        b.set(source.slice(offset, offset + len), 0)
        offset += b.byteLength
      }
      return offset
    }

    // get some bytes from iovecs
    write () {
      const { getString } = getHelpers()
      const i = 0
      let text = ''
      for (const [offset, length] of this.iovs) {
        const textChunk = getString(offset, length)
        text += textChunk
      }
      return text
    }
  }

  // stdin, stdout, stderr, /
  const fds = [null, null, null, null]

  const wasi = {
    _exited: false,

    _stdin: '',

    _set_instance (i) {
      instance = i
    },

    // there is no real "exit" in wasm, but this will tell the user it exited.
    proc_exit (code) {
      stderr('exit ' + code)
      wasi._exited = true
      return 0
    },

    clock_res_get (clock_id) {
      if (clock_id !== 0) {
        return WASI_EINVAL
      }
      return 1000000000n
    },

    clock_time_get (clock_id, precision, memLoc) {
      if (clock_id !== 0) {
        return WASI_EINVAL
      }
      const dataView = new DataView(wasm.memory.buffer)
      dataView.setBigUint64(memLoc, BigInt(Date.now()) * (precision / 1000n), true)
    },

    random_get (bufPtr, buf_len) {
      const mem = new Uint8Array(wasm.memory.buffer)
      for (let i = 0; i <= buf_len; i++) {
        mem[bufPtr + i] = (Math.random() * 255) | 0
      }
    },

    fd_write (fd, iovsPtr, iovsLength, bytesWrittenPtr) {
      try {
        if (fds[fd] === undefined) {
          throw new Error(`Invalid fd: ${fd}`)
        }

        if (fd === FILENO_STDIN) {
          throw new Error('Cannot write to stdin')
        }
        const dataView = getDataView()
        const iovs = new Iovec(iovsPtr, iovsLength)
        const text = iovs.write()
        dataView.setUint32(bytesWrittenPtr, text.length, true)

        if (fd === FILENO_STDOUT) {
          stdout(text)
        }
        if (fd === FILENO_STDERR) {
          stderr(text)
        }

        // TODO: handle other files

        return WASI_ESUCCESS
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    fd_prestat_get (fd, bufPtr) {
      // we only have 1 directory mounted: /
      if (fd === 3) {
        const { struct } = getHelpers()
        const wasi_prestat = struct({
          type: 'Uint8',
          name_len: 'Uint32'
        })
        const ret = wasi_prestat({ type: PREOPENTYPE_DIR, name_len: 1 }, bufPtr)
        return WASI_ESUCCESS
      }
      return WASI_EBADF
    },

    fd_prestat_dir_name (fd, pathPtr, pathLen) {
      const { setString } = getHelpers()
      // we only have 1 directory mounted: /
      setString(pathPtr, '/')
      return WASI_ESUCCESS
    },

    path_filestat_get (dirFd, flags, pathPtr, pathLen, retbufPtr) {
      try {
        const { struct, getString } = getHelpers()
        const path = getString(pathPtr, pathLen)
        const f = fs.statSync(path)

        if (!f) {
          throw new Error('File not found.')
        }

        const wasi_filestat = struct({
          dev: 'BigUint64',
          ino: 'BigUint64',
          filetype: 'BigUint64',
          nlink: 'BigUint64',
          size: 'BigUint64',
          atim: 'BigUint64',
          mtim: 'BigUint64',
          ctim: 'BigUint64'
        })

        let fileType = 0 // unknown

        if (path === '/dev/stdout' || path === '/dev/stderr' || path === '/dev/stdin') {
          fileType = 2 // character_device
        } else if (f.isDirectory()) {
          fileType = 3
        } else {
          fileType = 4 // regular_file
        }

        wasi_filestat({
          dev: BigInt(f.dev),
          ino: BigInt(f.ino),
          filetype: BigInt(fileType),
          nlink: BigInt(f.nlink),
          size: BigInt(f.size),
          atim: BigInt(f.atime.getTime() / 1000 | 0),
          mtim: BigInt(f.mtime.getTime() / 1000 | 0),
          ctim: BigInt(f.ctime.getTime() / 1000 | 0)
        }, retbufPtr)

        return WASI_ESUCCESS
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    fd_fdstat_get (fd, bufPtr) {
      try {
        const { struct } = getHelpers()

        const wasi_fdstat = struct({
          filetype: 'Uint8',
          flags: 'Uint16',
          rights_base: 'BigUint64',
          rights_inheriting: 'BigUint64'
        })

        let filetype = 0 // unknown
        if (fd !== 0 && fd !== 1 && fd !== 2) {
          if (fd === 3) { // root dir
            filetype = 3
          } else {
            if (!fds[fd]) {
              throw new Error(`fd ${fd} is not available.`)
            }
            const f = fs.statSync(fds[fd])
            if (f.isDirectory()) {
              filetype = 3
            } else {
              filetype = 4 // regular_file
            }
          }
        } else {
          filetype = 2 // character_device
        }

        const ret = wasi_fdstat({ filetype }, bufPtr)

        // TODO

        ret.flags = 0
        ret.rights_base = 0n
        ret.rights_inheriting = 0n

        return WASI_ESUCCESS
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    path_open (dirfd, dirflags, pathPtr, pathLen, o_flags, fs_rights_base, fs_rights_inheriting, fs_flags, fdPointer) {
      const { getString } = getHelpers()
      const dataView = getDataView()
      try {
        const path = getString(pathPtr, pathLen)
        if (!fs.existsSync(path)) {
          throw new Error('File does not exist.')
        }
        // TODO: do actual fs.openSync here
        fds.push(path)
        dataView.setUint32(fdPointer, fds.length - 1, true)
        return WASI_ESUCCESS
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    fd_read (fd, iovsPtr, iovsLength, bytesReadPtr) {
      try {
        if (fds[fd] === undefined) {
          throw new Error(`Invalid fd: ${fd}`)
        }
        if (fd === FILENO_STDOUT || fd === FILENO_STDERR) {
          throw new Error('Cannot read from stdout/stderr')
        }

        const source = fd === FILENO_STDIN ? encoder.encode(wasi._stdin) : fs.readFileSync(fds[fd])

        if (fd === FILENO_STDIN) {
          wasi._stdin = ''
        }

        const iovs = new Iovec(iovsPtr, iovsLength)
        const totalBytes = iovs.read(source)
        const dataView = new DataView(instance.exports.memory.buffer)
        dataView.setUint32(bytesReadPtr, totalBytes, true)

        // TODO: this gets in a loop for some reason, stopping with WASI_EBADF, but I should return WASI_ESUCCESS
        return WASI_EBADF
      } catch (e) {
        console.error(e)
        return WASI_EBADF
      }
    },

    // TODO: still working on these

    fd_close (fd) {
      console.log('fd_close', fd)
      return WASI_ESUCCESS
    },

    fd_seek (...args) {
      console.log('fd_seek', args)
      return WASI_ESUCCESS
    },

    fd_fdstat_set_flags (...args) {
      console.log('fd_fdstat_set_flags', args)
      return WASI_ESUCCESS
    }
  }

  return wasi
}
