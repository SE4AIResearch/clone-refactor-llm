
function menu(index, relativePath) {
	relativePath = typeof relativePath !== 'undefined' ? relativePath : '';
    var pages = ['index.html', 'publications.html', 'bibbase.html', 'students.html', 'projects.html', 'teaching.html', 'service.html', 'awards.html'];
    var titles = ['Home', 'Publications', 'BibBase', 'Students', 'Projects', 'Teaching', 'Service', 'Awards'];

    document.write('            <ul>');

    for (var i=0; i<pages.length; i++) {
        if (index == i) {
            document.write('				<li class="active"><a class="active" href="' + relativePath + pages[i] + '">' + titles[i] + '</a></li>');
        }
        else {
            document.write('				<li><a href="' + relativePath + pages[i] + '">' + titles[i] + '</a></li>');
        }
    }

    document.write('			</ul>');
}

function footer() {
	document.write('		<p><strong>Mailing Address:</strong> 1455 De Maisonneuve Blvd. West, Montreal, Quebec, Canada H3G 1M8<br/><strong>Office:</strong> EV 3.187 &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <strong>Telephone:</strong> (1) 514-848-2424 ext. 3020<br/><strong>Email:</strong> tsantalis [at] cse.concordia.ca | nikolaos.tsantalis [at] concordia.ca</p>');
    document.write('		<p>&copy; 2018 Nikolaos Tsantalis | <a href="http://andreasviklund.com/templates/inland/">Template design</a> by <a href="http://andreasviklund.com/">andreasviklund.com</a></p>');
	document.write('		<p style="font-size:20px">æ­¦å£«é“</p>');
}