#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

int main() {
  char* filename = "assets/textfiles/cyberpunk.txt";

  printf("This is a simple tester of filesystem stuff.\n\n");
  perror("This is a test of stderr");

  // get file info
  struct stat st;
  stat(filename, &st);
  printf("Filesize: %llu\n\n", st.st_size);

  // read file
  char buffer[1024];
  FILE *file = fopen(filename, "r");
  
  if (file == NULL) {
    perror("File Open Error");
    return 1;
  }

  int readstuff=0;
  while (fgets(buffer, 1024, file) != NULL) {
    printf("%s\n\n", buffer);
    readstuff=1;
  }

  if (!readstuff) {
    perror("File Read Error");
  }

  printf("finished reading file.\n");

  fclose(file);

  return 0;
}
