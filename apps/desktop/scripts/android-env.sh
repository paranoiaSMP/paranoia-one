#!/usr/bin/env bash
# Source this file before the Android commands if your SDK uses this location.
export ANDROID_HOME="${ANDROID_HOME:-$HOME/Android/Sdk}"
if [[ -z "${JAVA_HOME:-}" ]] && command -v javac >/dev/null; then
  java_compiler="$(readlink -f "$(command -v javac)")"
  export JAVA_HOME="${java_compiler%/bin/javac}"
  unset java_compiler
fi
export NDK_HOME="${NDK_HOME:-$ANDROID_HOME/ndk/27.2.12479018}"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
