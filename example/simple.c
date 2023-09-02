#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>

int main() {
  char* filename = "assets/textfiles/cyberpunk.txt";

  printf("This is a simple tester of filesystem stuff.\n");

  // get file info
  struct stat st;
  stat(filename, &st);
  printf("Filesize: %llu\n", st.st_size);

  // read file
  char buffer[1024];
  FILE *file = fopen(filename, "r");
  
  if (file == NULL) {
    perror("Error opening file!\n");
    return 1;
  }

  while (fgets(buffer, sizeof(buffer), file) != NULL) {
    printf("%s", buffer);
  }

  fclose(file);

  return 0;
}
