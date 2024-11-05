require 'tempfile'

Jekyll::Hooks.register :documents, :pre_render do |document|
  if document.extname == ".md"
    content = document.content

    content.gsub!(/```(\w+)?\n(.*?)```/m) do |match|
      lang = $1 || 'plaintext'
      code = $2

      # Write code to a temporary file
      Tempfile.create(['code_block', '.txt']) do |tempfile|
        tempfile.write(code)
        tempfile.close

        # Call Node script with language and path to the temporary file
        highlighted_code = `node scripts/highlight_code.mjs "#{lang}" "#{tempfile.path}"`
        "<div class='code-block'>#{highlighted_code}</div>"
      end
    end

    document.content = content
  end
end